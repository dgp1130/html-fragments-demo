import { parseDomFragment } from './dom.js';

/**
 * An editable tweet which saves to the server and re-renders with the server's
 * response.
 */
 export class MyEditableTweet extends HTMLElement {
    public shadowRoot!: ShadowRoot;
    public tweetId!: number;
    public content!: string;

    public constructor() {
        super();
        this.input.value = this.content;
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
        const tweetElTemplate = await parseDomFragment(res);
        this.replaceWith(tweetElTemplate.content.cloneNode(true /* deep */));
    }).bind(this);

    private get input(): HTMLInputElement {
        return this.shadowRoot.querySelector('input')!;
    }

    private get saveBtn(): HTMLButtonElement {
        return this.shadowRoot.querySelector('button')!;
    }
}

customElements.define('my-editable-tweet', MyEditableTweet);

declare global {
    interface HTMLElementTagNameMap {
        'my-editable-tweet': MyEditableTweet;
    }
}
