import { parseDomFragment } from './dom.js';

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

    private onEdit = ((): void => {
        // Replace this element with a `<my-editable-tweet />` element.
        const editableTweet = document.createElement('my-editable-tweet');
        editableTweet.tweetId = this.tweetId;
        editableTweet.content = this.shadowRoot.querySelector('span')!.textContent!;
        this.replaceWith(editableTweet);
        editableTweet.focus();
    }).bind(this);
}

customElements.define('my-tweet', MyTweet);

declare global {
    interface HTMLElementTagNameMap {
        'my-tweet': MyTweet;
    }
}

/**
 * An editable tweet which saves to the server and re-renders with the server's
 * response.
 */
export class MyEditableTweet extends HTMLElement {
    public shadowRoot!: ShadowRoot;
    public tweetId!: number;
    private input: HTMLInputElement;
    private saveBtn: HTMLButtonElement;

    public constructor() {
        super();

        const shadowRoot = this.attachShadow({ mode: 'open' });

        this.input = document.createElement('input');
        this.input.type = 'text';
        shadowRoot.appendChild(this.input);

        this.saveBtn = document.createElement('button');
        this.saveBtn.textContent = 'Save';
        shadowRoot.appendChild(this.saveBtn);
    }

    public set content(value: string) {
        this.input.value = value;
    }

    protected connectedCallback(): void {
        this.saveBtn.addEventListener('click', this.onSave);
    }

    protected disconnectedCallback(): void {
        this.saveBtn.removeEventListener('click', this.onSave);
    }

    private onSave = (async () => {
        // Save the edit to the server, and swap out this element with the new
        // content returned by the server.
        const url = `/tweet/edit?id=${this.tweetId}&content=${encodeURIComponent(this.input.value)}`;
        const res = await fetch(url, { method: 'POST' });
        const [ tweetEl ] = await parseDomFragment(res);
        this.replaceWith(tweetEl);
    }).bind(this);

    public focus(): void {
        this.input.focus();
    }
}

customElements.define('my-editable-tweet', MyEditableTweet);

declare global {
    interface HTMLElementTagNameMap {
        'my-editable-tweet': MyEditableTweet;
    }
}
