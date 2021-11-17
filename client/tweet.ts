import { parseDomFragment } from './dom.js';
import { MyEditableTweet } from './editable-tweet.js';

// Fetches the editable tweet template.
const editableTweetTemplatePromise = (async (): Promise<HTMLTemplateElement> => {
    const res = await fetch('/editable-tweet');
    return await parseDomFragment(res);
})();

// Clones an editable tweet and returns it as a `DocumentFragment`.
async function getEditableTweet(tweetId: number, content: string):
        Promise<DocumentFragment> {
    const template = await editableTweetTemplatePromise;
    const instance =
        template.content.cloneNode(true /* true */) as DocumentFragment;
    const editableTweet = instance.firstElementChild as MyEditableTweet;
    editableTweet.tweetId = tweetId;
    editableTweet.content = content;
    return instance;
}

/** Custom element representing a tweet, simply implements an edit button. */
export class MyTweet extends HTMLElement {
    public shadowRoot!: ShadowRoot;
    private tweetId: number;

    public constructor() {
        super();

        const idString = this.getAttribute('tweet-id');
        if (!idString) throw new Error('`tweet-id` attribute is required.');
        this.tweetId = parseInt(idString);
        if (isNaN(this.tweetId)) throw new Error(`\`tweet-id\` attribute is not a number: "${idString}".`)
    }

    protected connectedCallback(): void {
        this.shadowRoot.querySelector('button')!
            .addEventListener('click', this.onEdit);
    }

    protected disconnectedCallback(): void {
        this.shadowRoot.querySelector('button')!
            .removeEventListener('click', this.onEdit);
    }

    private onEdit = (async (): Promise<void> => {
        // Replace this element with a `<my-editable-tweet />` element.
        const content = this.shadowRoot.querySelector('span')!.textContent!;
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
