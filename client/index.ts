import { parseDomFragment, streamDomFragment } from './dom.js';

(async () => {
    const tweetList = document.getElementById('tweets')!;

    // Bind "Load more" button to load an additional, random tweet.
    const loadMoreBtn = document.getElementById('load-more')!;
    loadMoreBtn.addEventListener('click', async () => {
        const tweetEl = await loadTweet(Math.floor(Math.random() * 10_000));
        tweetList.appendChild(wrapInListItem(tweetEl));
    });

    // Bind "Stream 5 tweets" button to stream random tweets.
    const streamTweetsBtn = document.getElementById('stream')!;
    streamTweetsBtn.addEventListener('click', async () => {
        for await (const tweet of streamTweets(5)) {
            tweetList.appendChild(wrapInListItem(tweet));
        }
    });

    // Load two tweets to start with.
    const firstTweet = await loadTweet(1234);
    tweetList.appendChild(wrapInListItem(firstTweet));
    const secondTweet = await loadTweet(4321);
    tweetList.appendChild(wrapInListItem(secondTweet));
})();

async function loadTweet(id: number): Promise<DocumentFragment> {
    const res = await fetch(`/tweet?id=${id}`);
    if (res.status >= 400) throw new Error(`HTTP request failed with status code: ${res.status}.`);
    const tweetElTemplate = await parseDomFragment(res);
    return tweetElTemplate.cloneContent();
}

async function* streamTweets(limit: number): AsyncGenerator<Node, void, void> {
    const res = await fetch(`/tweet/stream?limit=${limit}`);
    if (res.status >= 400) throw new Error(`HTTP request failed with status code: ${res.status}.`);
    for await (const node of streamDomFragment(res)) {
        yield node.cloneContent();
    }
}

function wrapInListItem(node: Node): HTMLLIElement {
    const listItem = document.createElement('li');
    listItem.appendChild(node);
    return listItem;
}
