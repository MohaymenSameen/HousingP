require('dotenv').config();
const puppeteer = require('puppeteer');
const { JSDOM } = require('jsdom');
const fetch = require('node-fetch');
const fs = require('fs');

const WIDTH = 1920;
const HEIGHT = 1080;

// JSON file to store the previous results
const storageFile = 'previous_results.json';

const { CHAT_ID, BOT_API } = process.env;

const urls = [
    'https://www.pararius.com/apartments/utrecht/0-1200/radius-50/since-3'
];

// Load the previous results from the storage
let previousResults = [];
try {
    if (fs.existsSync(storageFile)) {
        const fileContent = fs.readFileSync(storageFile, 'utf8');
        previousResults = JSON.parse(fileContent);
    }
} catch (error) {
    console.error('Error loading previous results:', error);
}

const runTask = async () => {
    for (const url of urls) {
        await runPuppeteer(url);
    }
}

const runPuppeteer = async (url) => {
    console.log('opening headless browser');
    const browser = await puppeteer.launch({
        headless: true,
        args: [`--window-size=${WIDTH},${HEIGHT}`],
        defaultViewport: {
            width: WIDTH,
            height: HEIGHT,
        },
    });

    const page = await browser.newPage();
    // https://stackoverflow.com/a/51732046/4307769 https://stackoverflow.com/a/68780400/4307769
    await page.setUserAgent('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/44.0.2403.157 Safari/537.36');

    console.log('going to pararius');
    await page.goto(url, { waitUntil: 'domcontentloaded' });

    const htmlString = await page.content();
    const dom = new JSDOM(htmlString);
    console.log('HTML Snippet:', htmlString.substring(0, 500)); 
    
    console.log('parsing pararius.com data');
    const result = dom.window.document.querySelectorAll('ul.search-list');
       if (result.length === 0) {
        console.log('No search results found. shig');
    } else {
        console.log(`Found ${result.length} items.`);
        result.forEach((item, index) => {
            console.log(`Item ${index + 1}:`, item.textContent.trim());
        });
    }

    if (result.length > 0) {
        const newResults = [];
        result.forEach((item) => {
            // Get the text content of the search result item
            const content = item.textContent.trim();

            // Get the href value of the anchor tag inside the search result item
            const anchorElement = item.querySelector('a'); // Assuming the anchor is a direct child
            const href = anchorElement ? anchorElement.getAttribute('href') : 'No href found';

            // Check if the result is already in the previous results list
            if (!previousResults.some((result) => result.href === href)) {
                newResults.push({ content, href });
            }
        });

        if (newResults.length > 0) {
            newResults.forEach((result, index) => {
                // Construct the message text
                const message = `New search result ${index + 1}: ${result.content}\nHref: https://www.pararius.com${result.href}`;

                // Send the message to the Telegram Bot API
                sendTelegramMessage(message);
            });

            // Update the storage with the new results
            previousResults = [...previousResults, ...newResults];
            fs.writeFileSync(storageFile, JSON.stringify(previousResults), 'utf8');
        } else {
            console.log('No new search results found.');
        }
    } else {
        console.log('No search results found.');
    }

    console.log('closing browser');
    await browser.close();
};

if (CHAT_ID && BOT_API) {
    runTask();
} else {
    console.log('Missing Telegram API keys!');
}

async function sendTelegramMessage(message) {
    const url = `https://api.telegram.org/bot${BOT_API}/sendMessage`;
    const data = {
        chat_id: CHAT_ID,
        text: message,
    };

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(data),
        });

        if (response.ok) {
            console.log('Message sent successfully to Telegram!');
        } else {
            console.log('Failed to send message to Telegram:', response.status, response.statusText);
        }
    } catch (error) {
        console.error('Error sending message to Telegram:', error);
    }
}
