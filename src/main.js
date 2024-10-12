require('dotenv').config();
const puppeteer = require('puppeteer');
const { JSDOM } = require('jsdom');
const fetch = require('node-fetch');
const fs = require('fs');

const WIDTH = 1920;
const HEIGHT = 1080;
const storageFile = 'previous_results.json';
const { CHAT_ID, BOT_API } = process.env;

const urls = [
    'https://www.pararius.com/apartments/utrecht/0-1200/radius-50/since-3'
];

// Load previous results
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
    console.log('Opening headless browser');
    const browser = await puppeteer.launch({
        headless: true,
        args: [ '--no-sandbox',
                '--disable-setuid-sandbox',
                `--window-size=${WIDTH},${HEIGHT}`],
        defaultViewport: {
            width: WIDTH,
            height: HEIGHT,
        },
    });

    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/44.0.2403.157 Safari/537.36');

    console.log('Navigating to page');
    await page.goto(url, { waitUntil: 'networkidle2' });
    await page.goto(url, { waitUntil: 'domcontentloaded' });

    const htmlString = await page.content();
    const dom = new JSDOM(htmlString);

    console.log('Parsing data...');
    const listings = dom.window.document.querySelectorAll('li.search-list__item.search-list__item--listing');

    if (listings.length > 0) {
        const newResults = [];
        listings.forEach((item) => {
            const location = item.querySelector("[class*='listing-search-item__sub-title']") ? item.querySelector("[class*='listing-search-item__sub-title']").textContent.trim() : 'No location';
            const price = item.querySelector('.listing-search-item__price') ? item.querySelector('.listing-search-item__price').textContent.trim() : 'No price';
            const rooms = item.querySelector('.illustrated-features__item--number-of-rooms') ? item.querySelector('.illustrated-features__item--number-of-rooms').textContent.trim() : 'No rooms';
            const area = item.querySelector('.illustrated-features__item--surface-area') ? item.querySelector('.illustrated-features__item--surface-area').textContent.trim() : 'No area';
            const linkElement = item.querySelector('a');
            const href = linkElement ? linkElement.getAttribute('href') : 'No link';

            if (!previousResults.some(result => result.href === href)) {
                newResults.push({ location, price, rooms, area, href });
            }
        });

        if (newResults.length > 0) {
            newResults.forEach((result, index) => {
                const message = `📍 *Location*: ${result.location}\n💰 **Price**: **${result.price}**\n🏡 *Rooms*: ${result.rooms}\n📏 *Area*: ${result.area} sqm\n🔗 [View listing](https://www.pararius.com${result.href})`;
                sendTelegramMessage(message);
            });

            previousResults = [...previousResults, ...newResults];
            fs.writeFileSync(storageFile, JSON.stringify(previousResults), 'utf8');
        } else {
            console.log('No new search results found.');
        }
    } else {
        console.log('No search results found.');
    }

    console.log('Closing browser');
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
        parse_mode: 'Markdown'  // This ensures the text formatting is applied correctly in Telegram
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
