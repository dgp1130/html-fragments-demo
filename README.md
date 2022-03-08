# HTML Fragments Demo

This is a proof concept demo for using HTML document fragments as a transfer
format between client and server.

See [the associated blog post](https://dwac.dev/posts/html-fragments/) for more
context about the motivation, goals, and design.

This is a _very_ simple Twitter clone which displays tweets to the user in a
list. Each tweet is requested dynamically, but rendered on the server and
inserted into the document at the appropriate place. There are two key features:

1.  "Load more" demos an endless scroll feature. Each time it is clicked, the
    client requests a random tweet and appends it to the list.
1.  "Edit" demos an editing feature whereby the user provides some new content
    and sends it to the server. The server would update any associated
    databases, and more importantly here, return the newly rendered tweet to the
    client to be updated in place.

The interesting aspect of the approach here is that it demonstrates two use
cases where client-side rendering would traditionally be required, either
necessitating:

1.  Developer support of CSR and SSR of the same component (a tweet).
1.  Committing to a fully CSR'd app.
1.  Refreshing the page to receive new SSR'd changes.

Here, the same functionality is supported, yet tweets are **always** server-side
rendered and include CSS and JS which get loaded by the browser when first
requested. Each time a tweet is loaded, it is simply appended to the document at
the relevant position, with no additional client-side logic required. This is
simple enough to not really require a comprehensive CSR framework while still
providing some dynamic features.
