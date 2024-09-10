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
    await page.setUserAgent('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/44.0.2403.157 Safari/537.36');

    console.log('going to pararius');
    await page.goto(url, { waitUntil: 'networkidle2' });
    await page.goto(url, { waitUntil: 'domcontentloaded' });

    const htmlString = await page.content();
    const dom = new JSDOM(htmlString);

    console.log('parsing pararius.com data');
    const result = dom.window.document.querySelectorAll('li.search-list__item.search-list__item--listing');

    if (result.length > 0) {
        const newResults = [];
        result.forEach((item) => {
            const content = item.textContent.trim();
            const anchorElement = item.querySelector('a');
            const href = anchorElement ? anchorElement.getAttribute('href') : 'No href found';

            // Extract other fields
            const location = item.querySelector('.listing-search-item__sub-title').textContent.trim();
            const price = item.querySelector('.listing-search-item__price').textContent.trim();
            const numOfRooms = item.querySelector('.illustrated-features__item--number-of-rooms').textContent.trim();
            const area = item.querySelector('.illustrated-features__item--surface-area').textContent.trim();

            if (!previousResults.some((result) => result.href === href)) {
                newResults.push({ content, href, location, price, numOfRooms, area });
            }
        });

        if (newResults.length > 0) {
            newResults.forEach((result, index) => {
                sendTelegramMessage(result);
            });

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

// Function to send message to Telegram with Markdown formatting
async function sendTelegramMessage(result) {
    const url = `https://api.telegram.org/bot${BOT_API}/sendMessage`;

    // Message formatting with additional fields
    const message = `*New Listing*\n\n*Location:* ${result.location}\n*Price:* *${result.price}*\n*Rooms:* ${result.numOfRooms}\n*Area:* ${result.area} m²\n[View listing](https://www.pararius.com${result.href})`;

    const data = {
        chat_id: CHAT_ID,
        text: message,
        parse_mode: 'Markdown'
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

if (CHAT_ID && BOT_API) {
    runTask();
} else {
    console.log('Missing Telegram API keys!');
}
