import * as fs from 'fs/promises';
import * as path from 'path';
import { Express } from 'express';

export function routingApp(app: Express): void {
  app.get([ '/routing/:page.html', '/routing/' ], (req, res) => {
    (async () => {
      const subPath = req.params.page ?? 'index';
      const filePath = path.join('build/client/routing/', `${subPath}.html`);
      const content = await fs.readFile(filePath, 'utf8');

      if (req.query.fragment !== undefined) {
        return content;
      } else {
        return renderPage(content);
      }
    })().then((result) => {
      res.contentType('text/html')
          .end(result);
    }, (err) => {
      res.status(500 /* HTTP Internal Server Error */)
          .contentType('text/html')
          .end(err.message);
    });
  });
}

function renderPage(content: string): string {
  return `
<!DOCTYPE html>
<html>
  <head>
    <title>Routes</title>
    <meta charset="utf8">

    <script src="/routing/routing.js" type="module"></script>
  </head>
  <body>
    <my-router>
      <nav>
        <ul>
          <li><a href="/routing/">Home</a></li>
          <li><a href="/routing/first.html">First</a></li>
          <li><a href="/routing/second.html">Second</a></li>
          <li><a href="/routing/third.html">Third</a></li>
        </ul>
      </nav>
      <slot>
        ${content}
      </slot>
    </my-router>
  </body>
</html>
  `.trim();
}
