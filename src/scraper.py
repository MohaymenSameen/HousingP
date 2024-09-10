import os
import requests
from bs4 import BeautifulSoup
import json

# Get environment variables
CHAT_ID = os.getenv('CHAT_ID')
BOT_API = os.getenv('BOT_API')

# File to store previous results
storage_file = 'previous_results.json'

# URLs to scrape
urls = [
    'https://www.pararius.com/apartments/utrecht/0-1200/radius-50/since-3'
]

# Load previous results
def load_previous_results():
    try:
        if os.path.exists(storage_file):
            with open(storage_file, 'r') as file:
                return json.load(file)
    except Exception as e:
        print(f"Error loading previous results: {str(e)}")
    return []

# Save new results
def save_results(results):
    with open(storage_file, 'w') as file:
        json.dump(results, file)

# Scrape the data
def scrape_data():
    new_results = []
    previous_results = load_previous_results()

    for url in urls:
        response = requests.get(url)
        soup = BeautifulSoup(response.text, 'html.parser')
        listings = soup.select('li.search-list__item.search-list__item--listing')
        
        for item in listings:
            anchor = item.find('a', class_='listing-search-item__link')
            if anchor:
                href = anchor.get('href')
                content = item.text.strip()
                full_link = f'https://www.pararius.com{href}'
                
                # Check if this result is already in previous results
                if not any(prev['href'] == href for prev in previous_results):
                    new_results.append({'content': content, 'href': full_link})
    
    # Save updated results
    save_results(previous_results + new_results)
    
    return new_results

# Send message to Telegram
def send_telegram_message(message):
    url = f"https://api.telegram.org/bot{BOT_API}/sendMessage"
    data = {'chat_id': CHAT_ID, 'text': message}
    
    try:
        response = requests.post(url, data=data)
        if response.status_code == 200:
            print("Message sent successfully!")
        else:
            print(f"Failed to send message: {response.status_code}")
    except Exception as e:
        print(f"Error sending message: {str(e)}")

# Main function
if __name__ == "__main__":
    if not CHAT_ID or not BOT_API:
        print("Missing CHAT_ID or BOT_API environment variables!")
    else:
        results = scrape_data()
        if results:
            for index, result in enumerate(results, 1):
                message = f"New search result {index}: {result['content']}\nLink: {result['href']}"
                send_telegram_message(message)
        else:
            print("No new results found.")
