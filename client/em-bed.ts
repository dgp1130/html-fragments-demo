import { parseDomFragment } from './dom.js';

class Embed extends HTMLElement {
    private loaded = false;

    public connectedCallback(): void {
        if (this.loaded) return;

        const src = this.getAttribute('src');
        if (!src) throw new Error(`<em-bed /> requires a \`src\` attribute.`);

        // Mark the component has loaded to avoid double-requesting the `src`
        // if this element is detached and reattached to the DOM.
        this.loaded = true;
        (async () => {
            const res = await fetch(src);
            const template = await parseDomFragment(res);
            this.appendChild(template.cloneContent());
        })();
    }
}

customElements.define('em-bed', Embed);
