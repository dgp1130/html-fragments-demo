import { env } from 'process';
import express, { Request } from 'express';

const app = express();

app.use(express.static('build/client/', {
    cacheControl: true,
    maxAge: 30_000 /* milliseconds */,
}));

/**
 * Renders a tweet with the given ID and content. Includes associated JavaScript
 * and CSS with the content inside declarative shadow DOM for isolation.
 */
function renderTweet(id: number, content: string): string {
    return `
<my-tweet tweet-id="${id}">
    <template shadowroot="open">
        <link rel="stylesheet" type="text/css" href="/tweet.css">
        <span>${content}</span>
        <button>Edit</button>
    </template>
    <script src="/tweet.js" type="module" async></script>
</my-tweet>
    `.trim();
}

function renderEditableTweet(): string {
    return `
<my-editable-tweet>
    <template shadowroot="open">
        <input type="text" />
        <button>Save</button>
    </template>
    <script src="/editable-tweet.js" type="module" async></script>
</my-tweet>
    `.trim();
}

/** Returns a generic tweet for the given ID. */
app.get('/tweet', (req, res) => {
    const id = parseIntegerParam(req, 'id');

    const content = renderTweet(id, `Hello world from tweet #${id.toString().padStart(4, '0')}.`);
    res.contentType('text/html').end(content);
});

/** Returns a generic editable tweet component. */
app.get('/editable-tweet', (_req, res) => {
    res.contentType('text/html').end(renderEditableTweet());
});

/**
 * "Edits" the tweet with the given ID to use the provided content. Also returns
 * a rendered tweet with the new content.
 */
app.post('/tweet/edit', (req, res) => {
    const id = parseIntegerParam(req, 'id');
    const content = req.query['content'];
    if (!content || typeof content !== 'string') throw new Error(`Editing a tweet requires \`?content\` to be set.`);

    res.contentType('text/html').end(renderTweet(id, content));
});

/**
 * Streams randomly generated, pre-rendered tweets. Uses the `?limit` parameter to determine
 * how many tweets to return.
 */
app.get('/tweet/stream', async (req, res) => {
    const limit = parseIntegerParam(req, 'limit');

    // Render `limit` amount of random tweet HTML.
    const responseText = Array.from({ length: limit }, () => {
        const id = Math.floor(Math.random() * 10_000);
        return renderTweet(id, `Hello world from tweet #${id.toString().padStart(4, '0')}.`);
    }).join('\n');

    res.contentType('text/html');

    // Stream the content in randomly sized chunks.
    for (const chunk of chunkText(responseText)) {
        // Short pause between each chunk.
        await new Promise<void>((resolve) => {
            setTimeout(() => { resolve(); }, 250);
        });

        res.write(chunk);
    }

    res.end();
});

/** Chunk the given text randomly. */
function* chunkText(text: string): Generator<string, void, void> {
    while (text.length !== 0) {
        if (text.length < 50) {
            yield text;
            text = '';
        } else {
            const chunkSize = Math.floor(Math.random() * text.length);
            const chunk = text.slice(0, chunkSize);
            const remaining = text.slice(chunkSize);
            yield chunk;
            text = remaining;
        }
    }
}

function parseIntegerParam(req: Request, name: string): number {
    const idQueryParam = req.query[name];
    if (!idQueryParam || typeof idQueryParam !== 'string') {
        throw new Error(`\`?${name}\` query param is required.`);
    }

    const id = parseInt(idQueryParam);
    if (isNaN(id)) throw new Error(`\`?${name}\` query param must be an integer.`);

    return id;
}

const port = env['PORT'] || 8000;
app.listen(port, () => {
    console.log(`Listening on port ${port}...`);
});
