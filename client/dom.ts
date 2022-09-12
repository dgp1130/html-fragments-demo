/**
 * Parse a network response as an HTML document fragment, then returns each
 * top-level element.
 */
export async function parseDomFragment(res: Response):
        Promise<Fragment<DocumentFragment>> {
    // Parse a fully rendered document fragment from the network response.
    const html = await res.text();
    const contentType = res.headers.get('Content-Type');
    if (!contentType) throw new Error('Response has no Content-Type.');
    const simpleContentType = contentType.indexOf(';') === -1
        ? contentType
        : contentType.slice(0, contentType.indexOf(';'))
    ;

    // Parse the HTML into a synthetic `Document` with DSD.
    // We *could* use the `{ includeShadowRoots: true }` option supported in Chromium.
    // https://web.dev/declarative-shadow-dom/#parser-only
    //
    // However, `parseDomFragment()` returns a `CloneableNode`, and you can't clone a `ShadowRoot`.
    // As a result, we deliberately *don't* parse DSD now, but instead parse the elements as regular
    // `<template />` tags and then stamp it after the clone.
    const doc = new DOMParser().parseFromString(html, simpleContentType as DOMParserSupportedType);

    // Put all the parsed `Nodes` into a single `DocumentFragment`. This allows
    // many top-level `Nodes` in an HTTP response to fit into a single return
    // value with no parent `Node`.
    const frag = document.createDocumentFragment();
    frag.append(...doc.body.childNodes);
    return Fragment.of(frag);
}

/**
 * Stream an HTML fragment from the given response. This returns an `AsyncGenerator` which yields
 * each top-level node in the HTTP response once each node is *completely* parsed.
 */
export async function* streamDomFragment(res: Response):
        AsyncGenerator<Fragment<Node>, void, void> {
    const body = res.body;
    if (!body) throw new Error(`Failed to get a \`body\` from the \`Response\` object.`);

    const textStream = parseText(iterateReader(body));
    yield* streamingParse(textStream);
}

/** Stream the top-level nodes from the HTML stream as they are parsed. */
async function* streamingParse(stream: AsyncGenerator<string, void, void>):
        AsyncGenerator<Fragment, void, void> {
    for await (const node of dropWhitespaceNodes(streamingParseTopLevelNodes(stream))) {
        yield Fragment.of(node);
    }
}

/**
 * Stream the top-level nodes in the given HTML stream. Nodes are emitted *after* being
 * fully parsed, meaning they contain all their content.
 */
async function* streamingParseTopLevelNodes(stream: AsyncGenerator<string, void, void>):
        AsyncGenerator<Node, void, void> {
    // Parse the input HTML and use it to iterate over each top-level `Node`.
    // Note that `parseAndObserveTopLevelNodeAdditions()` emits each `Node` when they
    // are *first parsed* in the HTTP response, and their content has *not* yet been parsed.
    const nodes = convertSubscribableToIterator(parseAndObserveTopLevelNodeAdditions(stream));

    // Don't emit a given `Node` until the *next* `Node` is received. This is because
    // an emitted `Node` has not yet had all its children parsed. There's no easy way
    // to identify when a `Node` is fully parsed, *but* once we start parsing the next
    // `Node` (or the stream ends), we must have fully parsed the previous `Node`.
    // Therefore, we delay `yield`-ing any `Node` until it's *next* `Node` has been
    // received.
    let prevNode: Node | undefined;
    for await (const node of nodes) {
        if (prevNode) yield prevNode;
        prevNode = node;
    }
    if (prevNode) yield prevNode;
}

/**
 * Parses the given stream of HTML and observes top-level `Nodes` created from
 * the parse, returning a `Subscribable` of the observed `Nodes`.
 * 
 * Ideally this would return an `AsyncGenerator`, however `MutationObserver`'s API
 * does not lend itself to that model. So instead, we implement this as a
 * `Subscribable` which can be generically converted into an `AsyncIterableIterator`.
 */
function parseAndObserveTopLevelNodeAdditions(stream: AsyncGenerator<string, void, void>):
        Subscribable<Node> {
    return (emit) => {
        // Create an HTML document to stream the HTTP response into.
        const doc = document.implementation.createHTMLDocument();
    
        // Observe the document 
        const obs = new MutationObserver((records) => {
            for (const record of records) {
                for (const added of record.addedNodes) {
                    emit({ value: added, done: false });
                }
            }
        });
        obs.observe(doc.body, { childList: true });
    
        // Asynchronously consume the rest of the stream.
        let canceled = false;
        (async () => {
            try {
                for await (const chunk of stream) {
                    if (canceled) break;
                    doc.write(chunk);
                }
            } finally {
                // Input fully processed, stop observing and complete the stream.
                obs.disconnect();
                emit({ value: undefined, done: true });
            }
        })();
    
        return () => { canceled = true; }
    };
}

/** Filters out empty whitespace `Nodes` in the given stream. */
async function* dropWhitespaceNodes(nodes: AsyncIterableIterator<Node>):
        AsyncGenerator<Node, void, void> {
    for await (const node of nodes) {
        const isWhitespace = node.nodeType === Node.TEXT_NODE && node.textContent!.trim() === '';
        if (!isWhitespace) yield node;
    }
}

/** Parses the given stream of binary data and converts it into a stream of UTF-8 text. */
async function* parseText(stream: AsyncGenerator<Uint8Array, void, void>):
        AsyncGenerator<string, void, void> {
    const decoder = new TextDecoder();
    for await (const chunk of stream) {
        yield decoder.decode(chunk, { stream: true })
    }
}

/** Converts the given `ReadableStream` into an `AsyncGenerator`. */
async function* iterateReader<T>(stream: ReadableStream<T>): AsyncGenerator<T, void, void> {
    const reader = stream.getReader();

    let readDone = false;
    try {
        do {
            const { value, done } = await reader.read();
            readDone = done;
            if (!value) continue;

            yield value;
        } while (!readDone);
    } finally {
        reader.releaseLock();
    }
}

/**
 * `Fragment` (not to be confused with `DocumentFragment`) represents a parsed
 * HTML fragment. It's main purpose is to be cloned similar to an
 * `HTMLTemplateElement`.
 */
export class Fragment<T extends Node = Node> {
    private constructor(private readonly node: T) { }

    public static of<T extends Node>(node: T): Fragment<T> {
        return new Fragment(node);
    }

    /**
     * Clones the content of the fragment and returns the cloned instance.
     * 
     * Semantically, this is very similar to `document.importNode()` plus the DSD and
     * `<script />` hacks. This helps automatically handle cases where users might
     * otherwise forget to call `document.importNode()` or `customElements.upgrade()`.
     */
    public cloneContent(): T {
        // Streamed elements are placed into a new document, which seems to be considered
        // "inert" and thus does not upgrade the components when attached (like template
        // contents, even though these elements do not come from a template). So we need
        // to adopt the node into the user's document and manually upgrade the elements.
        // https://github.com/WICG/webcomponents/issues/946#issuecomment-999322180
        const clone = document.importNode(this.node, true /* deep */);

        // Apply hacks to fix DSD and `<script />` tags in the HTML fragment.
        if (clone instanceof Element || clone instanceof DocumentFragment) {
            fixupDeclarativeShadowDom(clone);
            fixupScripts(clone);
        }

        return clone;
    }

    /**
     * Preload all the `<script />` tags in the given template and resolve once they
     * have all been executed. Inline scripts are not awaited. All scripts *must* use
     * `type="module"`.
     * 
     * This is useful if the HTML fragment contains a web component. The first time a web
     * component is appended to the DOM, will _not_ be upgraded because it's `<script />`
     * tag and associated class definition haven't been loaded yet. This causes numerous
     * timing challenges. In particular, ES2022 class fields will unassign any existing
     * properties. Meaning code like this is unexpectedly wrong:
     * 
     * ```typescript
     * import type { MyElement } from '...';
     * 
     * const cloneable = CloneableNode.of(someNode);
     * const instance = cloneable.clone().firstElementChild as MyElement;
     * instance.foo = 'bar';
     * document.body.appendChild(instance);
     * // BROKEN!
     * ```
     * 
     * This is broken because `MyElement's` class definition definition hasn't been loaded
     * yet. It isn't loaded until after `instance` is appended to the DOM, which
     * presumably includes the `<script />` tag with `MyElement's` definition. That class
     * will be lazy loaded, which would normally be fine. However, in ES2022, JS class
     * fields will reset any defined properties already on the object. This means that
     * when `MyElement's` constructor runs, it will automatically reset the `foo` property
     * and the `'bar'` string will be lost.
     * 
     * The solution is to run `.preloadScripts()` to load `MyElement's` class definition
     * *before* the element upgrades. This looks like:
     * 
     * ```typescript
     * import type { MyElement } from '...';
     * 
     * const cloneable = CloneableNode.of(someNode);
     * await cloneable.preloadScripts(); // Load `MyElement` class.
     * 
     * const instance = cloneable.clone().firstElementChild as MyElement;
     * instance.foo = 'bar';
     * document.body.appendChild(instance);
     * // WORKS!
     * ```
     */
    public async preloadScripts(): Promise<void> {
        // Ignore if the node does not have any children.
        if (this.node.nodeType !== Node.ELEMENT_NODE && this.node.nodeType !== Node.DOCUMENT_FRAGMENT_NODE) {
            return;
        }

        // Find all `<script />` tags in the node.
        const scripts = Array.from(
            (this.node as unknown as Element).querySelectorAll('script'));

        for (const script of scripts) {
            if (script.getAttribute('type') !== 'module') {
                throw new Error(`Found \`<script src="${
                    script}"></script>\` *without* \`type="module"\`. Module scripts are *required* in \`preloadScripts()\`,`);
            }
    
            // Clone the script to avoid mutating the template and append it to the DOM to execute it.
            document.head.append(script.cloneNode());
        }
    
        // Dynamic import all the scripts inserted into the DOM to wait for them to load
        // and execute.
        await Promise.all(scripts
            .map((script) => {
                const src = script.getAttribute('src');
    
                // Ignore scripts with no `src` as they must be inline scripts which
                // execute immediately. Inline module scripts are not a thing, so `import`
                // statements aren't allowed and won't delay execution. Technically top-level
                // async could delay execution of the full script, but this edge case is
                // ignored for simplicity.
                if (!src) return Promise.resolve();
    
                return import(src);
            })
        );
    }
}

/** Applies any DSD templates in the given root element. */
function fixupDeclarativeShadowDom(root: Element | DocumentFragment): void {
    // DSD not handled by the parser will leave `<template shadowroot="..." />` nodes
    // in the DOM. Find these nodes, stamp them, and attach that content to the
    // parent's shadow root just like the parser would normally do.
    const templates = Array.from(root.querySelectorAll('template[shadowroot]')) as HTMLTemplateElement[];
    for (const template of templates) {
        const mode = template.getAttribute('shadowroot');
        if (!mode) continue; // Regular `<template />` tag, not DSD.
    
        // Clone the template, apply it to the parent's shadow root, and remove the template.
        const shadowRoot = template.parentElement!.attachShadow({
            mode: mode as ShadowRootMode,
        });
        const contents = template.content.cloneNode(true /* deep */);
        shadowRoot.appendChild(contents);
        template.remove();
    }
}

/**
 * A weak set of all fixed `HTMLScriptElements` so we don't try to fix them again
 * and lead to infinite recursion.
 */
const fixedScriptSet = new WeakSet<HTMLScriptElement>();

/**
 * Replace each `<script />` in the given element with a copy.
 * `DOMParser.parseFromString()` disables `<script />` tags. Cloning and
 * replacing each `<script />` tag means it will be loaded when attached to the
 * active document.
 * 
 * Also note that `<script />` tags should include `type="module"`, or else
 * multiple DOM fragments with the same `<script src="..."></script>` will fetch
 * and execute the resource multiple times on the same page. Module scripts have
 * a cache so multiple tags of the same resource won't duplicate execution.
 * 
 * @link https://www.w3.org/TR/DOM-Parsing/#:~:text=script%20elements%20get%20marked%20unexecutable%20and%20the%20contents%20of%20noscript%20get%20parsed%20as%20markup.
 * @link https://html.spec.whatwg.org/multipage/webappapis.html#fetch-a-classic-script
 * @link https://html.spec.whatwg.org/multipage/webappapis.html#fetch-a-single-module-script
 */
function fixupScripts(root: Element | DocumentFragment): void {
    const scripts = Array.from(root.querySelectorAll('script')) as HTMLScriptElement[];
    for (const oldScript of scripts) {
        // Don't process a script multiple times, or it leads to infinite recursion.
        if (fixedScriptSet.has(oldScript)) continue;

        // Fix the script by cloning it.
        const newScript = manualClone(oldScript);
        fixedScriptSet.add(newScript);

        // Replace the script tag with its fixed version.
        oldScript.replaceWith(newScript);
    }
}

/**
 * Manually clone the given `<script />` tag. This drops some internally stored information from when it
 * was originally parsed. This clone means that the new `<script />` tag will be executed when stamped,
 * even if the original script came from a parsing context where scripting was disabled (such as `DOMParser`).
 */
function manualClone(oldScript: HTMLScriptElement): HTMLScriptElement {
    const newScript = document.createElement('script');
    for (const name of oldScript.getAttributeNames()) {
        newScript.setAttribute(name, oldScript.getAttribute(name)!);
    }
    newScript.textContent = oldScript.textContent;
    return newScript;
}

/**
 * Simplistic implementation of a `Subscribable`, where it is simply a function which takes a subscriber
 * (`emit` function) and calls it with an `IteratorResult` when a value is given or the stream completes.
 * Also returns a function which can be called to cancel the stream and stop subscribing to it.
 */
type Subscribable<T> = (emit: (value: IteratorResult<T, void>) => void) => Cancel;
type Cancel = () => void;

/**
 * Converts a `Subscribable<T>` into an `AsyncIterableIterator<T>`. The main purpose of this function is
 * to convert a callback based async iterator API (like `MutationObserver`) into something which can be
 * `for await`-ed.
 */
function convertSubscribableToIterator<T>(subscribable: Subscribable<T>): AsyncIterableIterator<T> {
    let pendingResolve: ((result: IteratorResult<T, void>) => void) | undefined;
    const resultQueue: IteratorResult<T, void>[] = [];

    // Called when the underlying `Subscribable` emits a value.
    function emit(value: IteratorResult<T, void>): void {
        if (pendingResolve) {
            // Returned iterator has already been polled and is awaiting a value, resolve it.
            pendingResolve(value);
            pendingResolve = undefined;
        } else {
            // Returned iterator is waiting to be polled, queue the result instead.
            resultQueue.push(value);
        }
    }

    // Invoke the underlying `Subscribable`.
    const cancel = subscribable(emit);

    return {
        // Caller invokes this function to poll the iterator.
        next(): Promise<IteratorResult<T, void>> {
            // If there are values in the queue, return the first one.
            if (resultQueue.length > 0) return Promise.resolve(resultQueue.shift()!);

            // Nothing in the queue, wait for the next value to arrive.
            return new Promise((resolve) => { pendingResolve = resolve; });
        },

        async return(): Promise<IteratorResult<T, void>> {
            cancel();
            return { value: undefined, done: true };
        },

        async throw(): Promise<IteratorResult<T, void>> {
            cancel();
            return { value: undefined, done: true };
        },

        [Symbol.asyncIterator]() {
            return this;
        }
    };
}
