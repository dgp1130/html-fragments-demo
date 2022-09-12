import { Fragment, parseDomFragment } from './dom.js';
import { MyEditableTweet } from './editable-tweet.js';

// Fetches the editable tweet template.
const editableTweetTemplatePromise = (async (): Promise<Fragment<DocumentFragment>> => {
    const res = await fetch('/editable-tweet');
    if (res.status >= 400) throw new Error(`HTTP request failed with status code: ${res.status}.`);
    return await parseDomFragment(res);
})();

// Clones an editable tweet and returns it as a `DocumentFragment`.
async function getEditableTweet(tweetId: number, content: string):
        Promise<MyEditableTweet> {
    // Clone a new instance of `MyEditableTweet`.
    const template = await editableTweetTemplatePromise;

    // Preload `MyEditableTweet's` class definition so we can assign properties
    // before appending it to the DOM.
    await template.preloadScripts();

    const editableTweet = template.cloneContent().firstElementChild as MyEditableTweet;
    editableTweet.tweetId = tweetId;
    editableTweet.content = content;
    return editableTweet;
}

/** Custom element representing a tweet, simply implements an edit button. */
export class MyTweet extends HTMLElement {
    private tweetId!: number;

    protected connectedCallback(): void {
        const idString = this.getAttribute('tweet-id');
        if (!idString) throw new Error('`tweet-id` attribute is required.');
        this.tweetId = parseInt(idString);
        if (isNaN(this.tweetId)) throw new Error(`\`tweet-id\` attribute is not a number: "${idString}".`);

        this.shadowRoot!.querySelector('button')!.addEventListener('click', this.onEdit);
    }

    protected disconnectedCallback(): void {
        this.shadowRoot!.querySelector('button')!.removeEventListener('click', this.onEdit);
    }

    private onEdit = (async (): Promise<void> => {
        // Replace this element with a `<my-editable-tweet />` element.
        const content = this.shadowRoot!.querySelector('span')!.textContent!;
        const editableTweet = await getEditableTweet(this.tweetId, content);
        this.replaceWith(editableTweet);
    }).bind(this);
}

customElements.define('my-tweet', MyTweet);

declare global {
    interface HTMLElementTagNameMap {
        'my-tweet': MyTweet;
    }
}
