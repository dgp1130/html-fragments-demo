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

/** Returns a generic tweet for the given ID. */
app.get('/tweet', (req, res) => {
    const id = parseIntegerParam(req, 'id');

    const content = renderTweet(id, `Hello world from tweet #${id}.`);
    res.contentType('text/html').end(content);
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
