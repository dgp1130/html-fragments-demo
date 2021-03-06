import { parseDomFragment } from './dom.js';

(async () => {
    const tweetList = document.getElementById('tweets')!;

    // Bind "Load more" button to load an additional, random tweet.
    const loadMore = document.getElementById('load-more')!;
    loadMore.addEventListener('click', async () => {
        const tweetEl = await loadTweet(Math.floor(Math.random() * 1000));
        tweetList.appendChild(wrapInListItem(tweetEl));
    });

    // Load two tweets to start with.
    const firstTweet = await loadTweet(1234);
    tweetList.appendChild(wrapInListItem(firstTweet));
    const secondTweet = await loadTweet(4321);
    tweetList.appendChild(wrapInListItem(secondTweet));
})();

async function loadTweet(id: number): Promise<DocumentFragment> {
    const res = await fetch(`/tweet?id=${id}`);
    const tweetElTemplate = await parseDomFragment(res);
    return tweetElTemplate.content.cloneNode(true /* deep */) as DocumentFragment;
}

function wrapInListItem(el: DocumentFragment): HTMLLIElement {
    const listItem = document.createElement('li');
    listItem.appendChild(el);
    return listItem;
}
