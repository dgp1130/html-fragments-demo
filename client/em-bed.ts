import { parseDomFragment } from './dom.js';

class Embed extends HTMLElement {
    public connectedCallback(): void {
        const src = this.getAttribute('src');
        if (!src) throw new Error(`<em-bed /> requires a \`src\` attribute.`);

        (async () => {
            const res = await fetch(src);
            const template = await parseDomFragment(res);
            const content = template.content.cloneNode(true /* deep */);
            this.appendChild(content);
        })();
    }
}

customElements.define('em-bed', Embed);
