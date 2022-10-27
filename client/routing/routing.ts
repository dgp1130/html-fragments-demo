import { Route, Router, parseDomFragment } from '../dom.js';

class MyRouter extends Router {
  protected override async route(route: Route): Promise<DocumentFragment> {
    const url = new URL(route.toString(), location.href);
    url.searchParams.set('fragment', '');

    const res = await fetch(url);
    const frag = await parseDomFragment(res);
    return frag.cloneContent();
  }
}

customElements.define('my-router', MyRouter);
