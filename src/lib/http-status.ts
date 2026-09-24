/**
 * The HTTP status code reference.
 *
 * Every code that has a current registration with IANA, plus the handful of
 * historical ones people still meet in the wild (305, 306, 418). Section
 * numbers point at RFC 9110 where the code is defined there, and at the
 * extension RFC otherwise — 9110 obsoleted 7231, so a reference to
 * "RFC 7231 §6.5.1" in older documentation is the same text under a new number.
 *
 * Pure data and pure functions: the tool page renders all of it server-side so
 * the explanations are crawlable, and the search below only filters what is
 * already in the HTML.
 */

export type HttpStatusClass = '1xx' | '2xx' | '3xx' | '4xx' | '5xx';

export interface HttpStatusCategory {
  id: HttpStatusClass;
  name: string;
  /** One line describing what the whole class means. */
  summary: string;
}

export interface HttpStatus {
  code: number;
  /** The reason phrase from the registry, e.g. "Not Found". */
  name: string;
  category: HttpStatusClass;
  /** What the code means, in one or two sentences. */
  meaning: string;
  /** The situation in which a server should actually send it. */
  whenToSend: string;
  /** The code it is routinely confused with, and how to tell them apart. */
  confusion?: string;
  /** Defining document and section. */
  spec: string;
  /** Extra search terms: what someone types when they do not know the number. */
  keywords?: string[];
  /** True for codes that are registered but no longer meaningfully used. */
  deprecated?: boolean;
}

export const HTTP_STATUS_CATEGORIES: HttpStatusCategory[] = [
  {
    id: '1xx',
    name: 'Informational',
    summary:
      'The request was received and the process is continuing. These are interim responses; another response always follows.',
  },
  {
    id: '2xx',
    name: 'Success',
    summary: 'The request was received, understood and accepted.',
  },
  {
    id: '3xx',
    name: 'Redirection',
    summary: 'Further action is needed to complete the request, usually following a Location header.',
  },
  {
    id: '4xx',
    name: 'Client error',
    summary:
      'The request was wrong: bad syntax, missing credentials, a resource that is not there. Repeating it unchanged will fail the same way.',
  },
  {
    id: '5xx',
    name: 'Server error',
    summary:
      'The request looked valid but the server could not fulfil it. The same request may succeed later.',
  },
];

export const HTTP_STATUSES: HttpStatus[] = [
  // ─── 1xx Informational ──────────────────────────────────────────────────
  {
    code: 100,
    name: 'Continue',
    category: '1xx',
    meaning:
      'The request headers were received and are acceptable, so the client should go ahead and send the request body.',
    whenToSend:
      'In reply to a request carrying `Expect: 100-continue`, once the headers have been checked and nothing about them requires rejecting the upload.',
    spec: 'RFC 9110 §15.2.1',
    keywords: ['expect', 'upload', 'interim'],
  },
  {
    code: 101,
    name: 'Switching Protocols',
    category: '1xx',
    meaning:
      'The server agrees to change the protocol on this connection to the one named in the request\'s Upgrade header.',
    whenToSend:
      'Completing a WebSocket handshake, or an HTTP/1.1 to HTTP/2 upgrade over cleartext. After this response the connection stops speaking HTTP/1.1.',
    spec: 'RFC 9110 §15.2.2',
    keywords: ['websocket', 'upgrade', 'ws', 'h2c'],
  },
  {
    code: 102,
    name: 'Processing',
    category: '1xx',
    meaning:
      'A WebDAV interim response meaning the server has accepted the request but has not finished it, sent to stop the client timing out.',
    whenToSend:
      'Rarely. It was defined for long-running WebDAV methods and was dropped in the revised WebDAV spec; 103 Early Hints covers the useful case better.',
    spec: 'RFC 2518 §10.1 (removed in RFC 4918)',
    keywords: ['webdav', 'timeout', 'long running'],
    deprecated: true,
  },
  {
    code: 103,
    name: 'Early Hints',
    category: '1xx',
    meaning:
      'An interim response that carries Link headers so the browser can start preloading assets before the real response is ready.',
    whenToSend:
      'When the final response will take time to generate but you already know which stylesheet, font or script the page needs. Send the hints, then the 200.',
    spec: 'RFC 8297',
    keywords: ['preload', 'preconnect', 'link header', 'performance'],
  },

  // ─── 2xx Success ────────────────────────────────────────────────────────
  {
    code: 200,
    name: 'OK',
    category: '2xx',
    meaning: 'The request succeeded and the response body carries the result.',
    whenToSend:
      'The default success response for GET, HEAD, PUT, PATCH, POST and DELETE whenever a representation is returned. For GET that is the resource; for POST it is the result of the action.',
    spec: 'RFC 9110 §15.3.1',
    keywords: ['success', 'fine', 'works'],
  },
  {
    code: 201,
    name: 'Created',
    category: '2xx',
    meaning: 'The request succeeded and one or more new resources exist as a result.',
    whenToSend:
      'After a POST or PUT that creates something. Include a Location header pointing at the new resource; the body should be its representation.',
    confusion:
      'A POST that creates nothing — a search, a calculation, a webhook receipt — should return 200 or 204, not 201.',
    spec: 'RFC 9110 §15.3.2',
    keywords: ['post', 'new resource', 'location'],
  },
  {
    code: 202,
    name: 'Accepted',
    category: '2xx',
    meaning:
      'The request was accepted for processing but nothing has happened yet, and it may still fail.',
    whenToSend:
      'When work is queued: a batch import, a video transcode, an email send. Return a way to check progress, because the client will never learn the outcome otherwise.',
    spec: 'RFC 9110 §15.3.3',
    keywords: ['async', 'queue', 'background job', 'pending'],
  },
  {
    code: 203,
    name: 'Non-Authoritative Information',
    category: '2xx',
    meaning:
      'The request succeeded, but a proxy modified the payload it received from the origin server.',
    whenToSend:
      'Almost never by an application. It is for transforming proxies that, for example, downscale images or strip tracking parameters.',
    spec: 'RFC 9110 §15.3.4',
    keywords: ['proxy', 'transformed'],
  },
  {
    code: 204,
    name: 'No Content',
    category: '2xx',
    meaning:
      'The request succeeded and there is deliberately no body. Any headers still apply.',
    whenToSend:
      'A DELETE that leaves nothing to show, a PUT where the client already holds the new state, or a form submission that should not navigate. A 204 must not carry a body — sending one breaks HTTP framing.',
    confusion:
      'Use 204 rather than 200 with an empty body: 200 promises a representation, so clients will try to parse the nothing they receive.',
    spec: 'RFC 9110 §15.3.5',
    keywords: ['empty', 'delete', 'no body'],
  },
  {
    code: 205,
    name: 'Reset Content',
    category: '2xx',
    meaning:
      'The request succeeded and the client should clear the form or document view that produced it.',
    whenToSend:
      'In a data-entry workflow where the user enters one record after another. It predates single-page applications and is rare now.',
    spec: 'RFC 9110 §15.3.6',
    keywords: ['form', 'clear', 'reset'],
  },
  {
    code: 206,
    name: 'Partial Content',
    category: '2xx',
    meaning: 'The response carries only the byte ranges the client asked for in its Range header.',
    whenToSend:
      'Serving a resumed download or a video seek. Include Content-Range, and make sure the ranges you send are the ones requested.',
    spec: 'RFC 9110 §15.3.7',
    keywords: ['range', 'resume', 'video', 'seek', 'byte range'],
  },
  {
    code: 207,
    name: 'Multi-Status',
    category: '2xx',
    meaning:
      'The body is an XML document containing a separate status for each of several independent operations.',
    whenToSend:
      'WebDAV only, for methods such as PROPFIND that act on a collection where each member can succeed or fail individually.',
    spec: 'RFC 4918 §11.1',
    keywords: ['webdav', 'propfind', 'batch'],
  },
  {
    code: 208,
    name: 'Already Reported',
    category: '2xx',
    meaning:
      'Inside a 207 body, marks a collection member whose result was already listed earlier in the same response.',
    whenToSend:
      'WebDAV binding scenarios, to avoid repeating the same subtree over and over when resources are linked into several places.',
    spec: 'RFC 5842 §7.1',
    keywords: ['webdav', 'binding', 'duplicate'],
  },
  {
    code: 226,
    name: 'IM Used',
    category: '2xx',
    meaning:
      'The response is the result of applying one or more instance manipulations — typically a delta — to the current resource.',
    whenToSend:
      'Delta encoding, where the server sends only what changed since the client\'s cached copy. Support is effectively nonexistent outside specialist deployments.',
    spec: 'RFC 3229 §10.4.1',
    keywords: ['delta encoding', 'instance manipulation'],
  },

  // ─── 3xx Redirection ────────────────────────────────────────────────────
  {
    code: 300,
    name: 'Multiple Choices',
    category: '3xx',
    meaning:
      'The request maps to more than one resource and the server is offering the client a list to pick from.',
    whenToSend:
      'Rarely, because there is no standard format for the list. Content negotiation normally happens through Accept headers instead.',
    spec: 'RFC 9110 §15.4.1',
    keywords: ['content negotiation', 'choices'],
  },
  {
    code: 301,
    name: 'Moved Permanently',
    category: '3xx',
    meaning:
      'The resource has a new permanent URL, given in the Location header. Clients, caches and search engines should update their references.',
    whenToSend:
      'A URL structure change, an http to https move, a domain migration — anything you never intend to undo. It is cached indefinitely by default, so it is very hard to take back.',
    confusion:
      '301 vs 308: both are permanent, but 301 historically caused clients to convert a POST into a GET, and browsers still do. 308 forbids that conversion. For a page, 301 is fine; for an API endpoint that accepts POST, use 308.',
    spec: 'RFC 9110 §15.4.2',
    keywords: ['permanent redirect', 'seo', 'moved', 'https redirect'],
  },
  {
    code: 302,
    name: 'Found',
    category: '3xx',
    meaning:
      'The resource is temporarily at a different URL. The original URL stays canonical and should be used for future requests.',
    whenToSend:
      'Short-lived redirects: maintenance pages, A/B splits, sending a user to a login page. Do not use it for a move you intend to keep.',
    confusion:
      '302 vs 307: the specification always said the method must not change, but browsers turned POST into GET anyway, so the spec gave up and defined 307 to mean "temporary, and really do keep the method". If a POST must stay a POST, send 307.',
    spec: 'RFC 9110 §15.4.3',
    keywords: ['temporary redirect', 'found', 'moved temporarily'],
  },
  {
    code: 303,
    name: 'See Other',
    category: '3xx',
    meaning:
      'The result of the request is at another URL, which should be fetched with GET regardless of the original method.',
    whenToSend:
      'The Post/Redirect/Get pattern. After a successful form POST, 303 to the result page so that reloading it does not resubmit the form.',
    spec: 'RFC 9110 §15.4.4',
    keywords: ['post redirect get', 'prg', 'form submit'],
  },
  {
    code: 304,
    name: 'Not Modified',
    category: '3xx',
    meaning:
      'The client\'s cached copy is still current, so no body is sent. It is a redirect to the cache rather than to another URL.',
    whenToSend:
      'When a conditional GET arrives — If-None-Match matching the current ETag, or If-Modified-Since at or after the last modification. Send the caching headers, never a body.',
    spec: 'RFC 9110 §15.4.5',
    keywords: ['etag', 'if-none-match', 'cache', 'conditional get'],
  },
  {
    code: 305,
    name: 'Use Proxy',
    category: '3xx',
    meaning: 'The resource must be accessed through the proxy named in the Location header.',
    whenToSend:
      'Never. It was deprecated for security reasons: it let any server redirect a client through a proxy of the server\'s choosing.',
    spec: 'RFC 9110 §15.4.6',
    keywords: ['proxy', 'deprecated'],
    deprecated: true,
  },
  {
    code: 306,
    name: '(Unused)',
    category: '3xx',
    meaning:
      'Reserved. An early draft used it for "Switch Proxy"; the code is kept reserved so nothing else claims it.',
    whenToSend: 'Never. It has no defined meaning and no client implements it.',
    spec: 'RFC 9110 §15.4.7',
    keywords: ['switch proxy', 'reserved', 'unused'],
    deprecated: true,
  },
  {
    code: 307,
    name: 'Temporary Redirect',
    category: '3xx',
    meaning:
      'Same as 302, with the method and body guaranteed to be preserved: a POST is re-sent to the new URL as a POST.',
    whenToSend:
      'Temporary redirects for APIs and anything non-GET. It is also what HSTS preloading does internally when upgrading a request to https.',
    confusion:
      'If you ever redirect a POST and the target receives a GET with no body, you sent 302 or 303 where you needed 307.',
    spec: 'RFC 9110 §15.4.8',
    keywords: ['temporary', 'preserve method', 'post redirect'],
  },
  {
    code: 308,
    name: 'Permanent Redirect',
    category: '3xx',
    meaning:
      'Same as 301, with the method and body guaranteed to be preserved. The new URL should replace the old one everywhere.',
    whenToSend:
      'Permanently moving an endpoint that accepts POST, PUT or PATCH. Like 301, it is cached aggressively — deploy it only once you are sure.',
    confusion:
      '308 vs 301: functionally identical for GET traffic. Search engines treat both as a permanent move and pass ranking signals the same way, so pick based on whether non-GET methods are involved.',
    spec: 'RFC 9110 §15.4.9',
    keywords: ['permanent', 'preserve method'],
  },

  // ─── 4xx Client error ───────────────────────────────────────────────────
  {
    code: 400,
    name: 'Bad Request',
    category: '4xx',
    meaning:
      'The server refuses to process the request because something about it is malformed — unparseable JSON, an illegal header, a bad query string.',
    whenToSend:
      'When the request itself is broken at the syntax level. If the syntax is fine but the values are wrong, 422 is more precise.',
    confusion:
      'It is often used as a catch-all for every client mistake. That works, but it tells the caller nothing; prefer the specific code where one exists.',
    spec: 'RFC 9110 §15.5.1',
    keywords: ['malformed', 'invalid json', 'bad syntax', 'parse error'],
  },
  {
    code: 401,
    name: 'Unauthorized',
    category: '4xx',
    meaning:
      'Authentication is required and has either not been supplied or has failed. Despite the name, this is about identity, not permission.',
    whenToSend:
      'No credentials, an expired token, a wrong password. The response must include a WWW-Authenticate header naming the scheme, which is the part almost every API forgets.',
    confusion:
      '401 vs 403: 401 means "I do not know who you are — try authenticating again". 403 means "I know exactly who you are, and you still cannot do this". Retrying with a fresh token can fix a 401; it will never fix a 403.',
    spec: 'RFC 9110 §15.5.2',
    keywords: ['login', 'token expired', 'authentication', 'unauthenticated', 'www-authenticate'],
  },
  {
    code: 402,
    name: 'Payment Required',
    category: '4xx',
    meaning: 'Reserved for future use; there has never been a standard payment protocol behind it.',
    whenToSend:
      'Some APIs use it for "your plan has run out" or "this account is in arrears". That is a reasonable convention but not a specified behaviour, so document it.',
    spec: 'RFC 9110 §15.5.3',
    keywords: ['billing', 'quota', 'subscription', 'plan limit'],
  },
  {
    code: 403,
    name: 'Forbidden',
    category: '4xx',
    meaning:
      'The server understood the request and is refusing it. Authenticating differently will not help.',
    whenToSend:
      'A valid user without the required role, an IP blocked by a firewall, a directory listing that is switched off. There is no obligation to explain why.',
    confusion:
      '403 vs 404: revealing that a resource exists but is off limits can itself be a leak. Many systems deliberately return 404 for resources the caller may not know about — GitHub does this for private repositories.',
    spec: 'RFC 9110 §15.5.4',
    keywords: ['permission denied', 'access denied', 'not allowed', 'forbidden'],
  },
  {
    code: 404,
    name: 'Not Found',
    category: '4xx',
    meaning:
      'There is no resource at this URL. The server will not say whether there ever was one or ever will be.',
    whenToSend:
      'An unknown path, a deleted record, a typo in an ID. Send it with a useful HTML page for browsers and a machine-readable body for APIs.',
    confusion:
      '404 vs 410: 404 says nothing about the future, 410 says the resource is deliberately gone for good. Search engines drop a 410 URL faster than a 404 one.',
    spec: 'RFC 9110 §15.5.5',
    keywords: ['not found', 'missing page', 'broken link', 'dead link'],
  },
  {
    code: 405,
    name: 'Method Not Allowed',
    category: '4xx',
    meaning:
      'The URL exists but does not support this method — a POST to a read-only endpoint, a DELETE where only GET is implemented.',
    whenToSend:
      'When the path is routable but the verb is not. The response must include an Allow header listing the methods that do work.',
    confusion:
      'If the URL itself is unknown, that is 404. A 405 is a promise that the resource exists.',
    spec: 'RFC 9110 §15.5.6',
    keywords: ['allow header', 'wrong verb', 'post not allowed'],
  },
  {
    code: 406,
    name: 'Not Acceptable',
    category: '4xx',
    meaning:
      'Nothing the server can produce matches the client\'s Accept, Accept-Language or Accept-Encoding headers.',
    whenToSend:
      'Rarely. Returning your best available representation is usually friendlier than refusing, and the spec explicitly allows that.',
    spec: 'RFC 9110 §15.5.7',
    keywords: ['accept header', 'content negotiation', 'mime type'],
  },
  {
    code: 407,
    name: 'Proxy Authentication Required',
    category: '4xx',
    meaning: 'Like 401, but the credentials are demanded by an intermediate proxy, not the origin server.',
    whenToSend:
      'By a proxy, together with a Proxy-Authenticate header. Seeing one from an API usually means a corporate proxy is intercepting the call.',
    spec: 'RFC 9110 §15.5.8',
    keywords: ['proxy', 'corporate network', 'proxy-authenticate'],
  },
  {
    code: 408,
    name: 'Request Timeout',
    category: '4xx',
    meaning:
      'The client opened a connection but did not send a complete request in the time the server was willing to wait.',
    whenToSend:
      'When an idle or half-sent request is being closed. It is a 4xx because the slow party was the client.',
    confusion:
      '408 is the client being slow to send; 504 is an upstream server being slow to answer. They are frequently mixed up in dashboards.',
    spec: 'RFC 9110 §15.5.9',
    keywords: ['timeout', 'slow client', 'idle connection'],
  },
  {
    code: 409,
    name: 'Conflict',
    category: '4xx',
    meaning:
      'The request is valid but clashes with the current state of the resource, and the clash is something the client could resolve and retry.',
    whenToSend:
      'A duplicate email on signup, an edit against a stale version, deleting a resource that still has children. Say in the body what conflicts.',
    confusion:
      '409 vs 422: 409 is about state — the same request would have worked a moment ago, or will work once something changes. 422 is about the content — the request will never work as written, no matter what the server state is.',
    spec: 'RFC 9110 §15.5.10',
    keywords: ['duplicate', 'already exists', 'version conflict', 'optimistic locking'],
  },
  {
    code: 410,
    name: 'Gone',
    category: '4xx',
    meaning: 'The resource used to exist here and has been permanently removed. No forwarding address.',
    whenToSend:
      'Retired API versions, deleted accounts, expired campaign URLs — anywhere you want crawlers and clients to stop asking.',
    spec: 'RFC 9110 §15.5.11',
    keywords: ['deleted', 'permanently removed', 'retired'],
  },
  {
    code: 411,
    name: 'Length Required',
    category: '4xx',
    meaning: 'The server refuses a request with a body but no Content-Length header.',
    whenToSend:
      'When you cannot accept chunked transfer encoding and need to know the size up front, typically to enforce a limit before reading.',
    spec: 'RFC 9110 §15.5.12',
    keywords: ['content-length', 'chunked'],
  },
  {
    code: 412,
    name: 'Precondition Failed',
    category: '4xx',
    meaning:
      'A conditional header such as If-Match or If-Unmodified-Since evaluated to false, so the request was not applied.',
    whenToSend:
      'Optimistic concurrency: the client sent the ETag it last saw, the resource has changed since, and applying the write would silently overwrite someone else\'s edit.',
    confusion:
      'On a conditional GET a failed precondition gives 304; on a write it gives 412. Same mechanism, different outcome.',
    spec: 'RFC 9110 §15.5.13',
    keywords: ['if-match', 'etag', 'concurrency', 'lost update'],
  },
  {
    code: 413,
    name: 'Content Too Large',
    category: '4xx',
    meaning: 'The request body is bigger than the server is willing or able to process.',
    whenToSend:
      'An upload over your limit. If the limit is temporary, add Retry-After. Nginx returns this as "413 Request Entity Too Large" — the name changed in RFC 9110, the meaning did not.',
    spec: 'RFC 9110 §15.5.14',
    keywords: ['payload too large', 'upload limit', 'request entity too large', 'file too big'],
  },
  {
    code: 414,
    name: 'URI Too Long',
    category: '4xx',
    meaning: 'The request target is longer than the server is prepared to interpret.',
    whenToSend:
      'Normally hit accidentally, when a form that should POST uses GET and pushes everything into the query string. Common server limits sit around 8 KB of request line.',
    spec: 'RFC 9110 §15.5.15',
    keywords: ['url too long', 'query string', 'request uri too large'],
  },
  {
    code: 415,
    name: 'Unsupported Media Type',
    category: '4xx',
    meaning: 'The body\'s Content-Type is one this endpoint does not accept.',
    whenToSend:
      'A form-encoded body sent to a JSON-only endpoint, or a missing Content-Type header. List what you do accept in the response body.',
    confusion:
      '415 is about the format of what was sent; 406 is about the format the client asked to receive.',
    spec: 'RFC 9110 §15.5.16',
    keywords: ['content-type', 'json only', 'media type', 'wrong format'],
  },
  {
    code: 416,
    name: 'Range Not Satisfiable',
    category: '4xx',
    meaning: 'None of the byte ranges requested overlap the resource — usually a start past the end of the file.',
    whenToSend:
      'When a resumed download asks for bytes that no longer exist because the file changed. Include Content-Range with the true size so the client can restart.',
    spec: 'RFC 9110 §15.5.17',
    keywords: ['range', 'resume download', 'byte range'],
  },
  {
    code: 417,
    name: 'Expectation Failed',
    category: '4xx',
    meaning: 'The expectation in the request\'s Expect header cannot be met by this server.',
    whenToSend:
      'When a client sends `Expect: 100-continue` and something in the chain will not honour it, or sends an expectation the server does not recognise.',
    spec: 'RFC 9110 §15.5.18',
    keywords: ['expect header', '100-continue'],
  },
  {
    code: 418,
    name: "I'm a Teapot",
    category: '4xx',
    meaning:
      'From the 1998 April Fools\' Hyper Text Coffee Pot Control Protocol: the server is a teapot and permanently refuses to brew coffee.',
    whenToSend:
      'Never in earnest. RFC 9110 reserves the code precisely so nobody can reassign it, because too many frameworks implement it as a joke. It is fine as an easter egg, terrible as an error contract.',
    spec: 'RFC 2324 §2.3.2, reserved by RFC 9110 §15.5.19',
    keywords: ['teapot', 'joke', 'april fools', 'coffee', 'htcpcp'],
  },
  {
    code: 421,
    name: 'Misdirected Request',
    category: '4xx',
    meaning:
      'The request reached a server that is not configured to produce a response for the authority in it.',
    whenToSend:
      'An HTTP/2 artefact. Connections are reused across hostnames that share a certificate, so a request for one host can arrive on another\'s connection; 421 tells the client to open a fresh one.',
    spec: 'RFC 9110 §15.5.20',
    keywords: ['http/2', 'connection coalescing', 'wrong host', 'sni'],
  },
  {
    code: 422,
    name: 'Unprocessable Content',
    category: '4xx',
    meaning:
      'The syntax is fine and the content type is understood, but the instructions inside cannot be followed — the data fails validation.',
    whenToSend:
      'Field-level validation failures: an email without an @, an end date before the start date, a required field left empty. Return the specific field errors.',
    confusion:
      '422 vs 400: if JSON.parse would fail, it is 400. If it parses cleanly and then fails your schema, it is 422. Some APIs use 400 for both, which is legal but loses the distinction.',
    spec: 'RFC 9110 §15.5.21 (originally RFC 4918)',
    keywords: ['validation', 'unprocessable entity', 'invalid fields', 'form errors'],
  },
  {
    code: 423,
    name: 'Locked',
    category: '4xx',
    meaning: 'The resource is locked and the request would modify it.',
    whenToSend: 'WebDAV, where a client holds an explicit lock token on a file or collection.',
    spec: 'RFC 4918 §11.3',
    keywords: ['webdav', 'lock'],
  },
  {
    code: 424,
    name: 'Failed Dependency',
    category: '4xx',
    meaning: 'The request failed only because an earlier request it depended on failed.',
    whenToSend:
      'WebDAV, inside a 207 response, for operations skipped because a previous step in the same atomic request did not succeed.',
    spec: 'RFC 4918 §11.4',
    keywords: ['webdav', 'dependency', 'atomic'],
  },
  {
    code: 425,
    name: 'Too Early',
    category: '4xx',
    meaning:
      'The server will not risk processing a request that arrived in TLS 1.3 early data, because early data can be replayed by an attacker.',
    whenToSend:
      'When 0-RTT is enabled and a non-idempotent request arrives in early data. The client should retry once the handshake is complete.',
    spec: 'RFC 8470 §5.2',
    keywords: ['tls 1.3', '0-rtt', 'early data', 'replay'],
  },
  {
    code: 426,
    name: 'Upgrade Required',
    category: '4xx',
    meaning: 'The server refuses this request on the current protocol and names a better one to switch to.',
    whenToSend:
      'Rejecting plaintext HTTP/1.0, or requiring a WebSocket upgrade. The response must carry an Upgrade header saying what to use.',
    spec: 'RFC 9110 §15.5.22',
    keywords: ['upgrade', 'protocol version', 'tls required'],
  },
  {
    code: 428,
    name: 'Precondition Required',
    category: '4xx',
    meaning:
      'The server requires the request to be conditional, and this one was not. It refuses unconditional writes on principle.',
    whenToSend:
      'To prevent the lost-update problem: demand If-Match so two clients cannot both overwrite the version they last read.',
    confusion:
      '428 means "you forgot to send a precondition"; 412 means "you sent one and it failed".',
    spec: 'RFC 6585 §3',
    keywords: ['if-match required', 'lost update', 'conditional request'],
  },
  {
    code: 429,
    name: 'Too Many Requests',
    category: '4xx',
    meaning: 'The client has sent too many requests in a given period and is being rate limited.',
    whenToSend:
      'Whenever a quota is exceeded. Always include Retry-After — without it every client will hammer you with its own guess about when to come back.',
    spec: 'RFC 6585 §4',
    keywords: ['rate limit', 'throttle', 'retry-after', 'quota', 'too many'],
  },
  {
    code: 431,
    name: 'Request Header Fields Too Large',
    category: '4xx',
    meaning: 'The headers are collectively or individually too large to process.',
    whenToSend:
      'Most often an oversized Cookie header after years of accumulated cookies on a domain. Typical server limits are 4–8 KB per header.',
    spec: 'RFC 6585 §5',
    keywords: ['cookie too large', 'header size', 'too many cookies'],
  },
  {
    code: 451,
    name: 'Unavailable For Legal Reasons',
    category: '4xx',
    meaning:
      'Access is denied because of a legal demand — a court order, a takedown notice, a statutory block.',
    whenToSend:
      'When the resource exists but you are compelled to withhold it. Include a Link header with rel="blocked-by" identifying who imposed the block. The number references Fahrenheit 451.',
    spec: 'RFC 7725 §3',
    keywords: ['censorship', 'dmca', 'geoblock', 'takedown', 'legal'],
  },

  // ─── 5xx Server error ───────────────────────────────────────────────────
  {
    code: 500,
    name: 'Internal Server Error',
    category: '5xx',
    meaning:
      'The server hit an unexpected condition and cannot be more specific. It is the catch-all for unhandled exceptions.',
    whenToSend:
      'When code threw and nothing caught it. Log the detail with a correlation ID, return the ID and nothing else — a stack trace in a 500 body is a genuine information leak.',
    confusion:
      'If the failure is actually a client mistake, a 500 sends the caller off debugging your server instead of their request. Check the 4xx list first.',
    spec: 'RFC 9110 §15.6.1',
    keywords: ['exception', 'crash', 'unhandled error', 'server error'],
  },
  {
    code: 501,
    name: 'Not Implemented',
    category: '5xx',
    meaning: 'The server does not support the functionality needed to fulfil the request at all.',
    whenToSend:
      'An unrecognised method, or a documented endpoint that is not built yet. It is about the server\'s capability, so it is a 5xx even though the trigger came from the client.',
    confusion:
      '501 means the server does not know this method anywhere; 405 means this particular resource does not accept it.',
    spec: 'RFC 9110 §15.6.2',
    keywords: ['not supported', 'unimplemented', 'unknown method'],
  },
  {
    code: 502,
    name: 'Bad Gateway',
    category: '5xx',
    meaning:
      'A proxy or load balancer got an invalid — or no — response from the server it forwarded to.',
    whenToSend:
      'Emitted by the intermediary, not by your application. In practice it means the upstream process crashed, refused the connection, or spoke something that was not valid HTTP.',
    confusion:
      '502 is an upstream that answered badly; 504 is an upstream that did not answer in time; 503 is this server saying it is out of service.',
    spec: 'RFC 9110 §15.6.3',
    keywords: ['nginx', 'upstream', 'load balancer', 'proxy error', 'backend down'],
  },
  {
    code: 503,
    name: 'Service Unavailable',
    category: '5xx',
    meaning:
      'The server is temporarily unable to handle the request — overloaded, or deliberately down for maintenance.',
    whenToSend:
      'Planned maintenance and load shedding. Send Retry-After, because it is the one signal that stops search engines de-indexing a site during a short outage.',
    spec: 'RFC 9110 §15.6.4',
    keywords: ['maintenance', 'overloaded', 'down', 'retry-after', 'outage'],
  },
  {
    code: 504,
    name: 'Gateway Timeout',
    category: '5xx',
    meaning: 'A proxy did not get a response from the upstream server within its time limit.',
    whenToSend:
      'By the intermediary when an upstream call runs long. The usual causes are a slow query, a deadlock, or a downstream dependency of the upstream itself timing out.',
    confusion:
      '504 is the proxy giving up on a server; 408 is a server giving up on a client that never finished sending.',
    spec: 'RFC 9110 §15.6.5',
    keywords: ['timeout', 'upstream timeout', 'slow query', 'gateway'],
  },
  {
    code: 505,
    name: 'HTTP Version Not Supported',
    category: '5xx',
    meaning: 'The major HTTP version used in the request is one the server refuses to support.',
    whenToSend:
      'Very rarely. A server that declines HTTP/1.0 or is given a nonsense version string in the request line.',
    spec: 'RFC 9110 §15.6.6',
    keywords: ['http version', 'protocol'],
  },
  {
    code: 506,
    name: 'Variant Also Negotiates',
    category: '5xx',
    meaning:
      'A content-negotiation misconfiguration: the chosen variant is itself set up to negotiate, so the process never terminates.',
    whenToSend: 'Only by servers implementing transparent content negotiation, as a configuration error.',
    spec: 'RFC 2295 §8.1',
    keywords: ['content negotiation', 'misconfiguration'],
  },
  {
    code: 507,
    name: 'Insufficient Storage',
    category: '5xx',
    meaning: 'The server cannot store the representation needed to complete the request.',
    whenToSend:
      'WebDAV, when a PUT or COPY would exceed the available quota or disk. Some object stores reuse it for quota errors.',
    spec: 'RFC 4918 §11.5',
    keywords: ['webdav', 'disk full', 'quota exceeded'],
  },
  {
    code: 508,
    name: 'Loop Detected',
    category: '5xx',
    meaning: 'The server stopped an operation because it found an infinite loop while processing it.',
    whenToSend: 'WebDAV, when bindings make a collection contain itself and a depth-infinity request would never end.',
    spec: 'RFC 5842 §7.2',
    keywords: ['webdav', 'infinite loop', 'binding'],
  },
  {
    code: 510,
    name: 'Not Extended',
    category: '5xx',
    meaning: 'The request needs further extensions declared in advance before the server will fulfil it.',
    whenToSend:
      'Effectively never. The HTTP extension framework it belongs to was made obsolete and never saw real deployment.',
    spec: 'RFC 2774 §7 (obsolete)',
    keywords: ['extension framework', 'obsolete'],
    deprecated: true,
  },
  {
    code: 511,
    name: 'Network Authentication Required',
    category: '5xx',
    meaning:
      'The client must authenticate to gain network access — this response comes from the network, not from the site being requested.',
    whenToSend:
      'By a captive portal on hotel or airport Wi-Fi, so that software can recognise an interception instead of concluding the API is broken. Intercepting proxies should use this rather than silently returning a login page with 200.',
    spec: 'RFC 6585 §6',
    keywords: ['captive portal', 'wifi login', 'hotspot', 'network login'],
  },
];

// ─── Lookups ──────────────────────────────────────────────────────────────

export const HTTP_STATUS_MAP: Record<number, HttpStatus> = Object.fromEntries(
  HTTP_STATUSES.map((s) => [s.code, s]),
);

/** Find one code. Returns undefined for anything not registered. */
export function findStatus(code: number): HttpStatus | undefined {
  return HTTP_STATUS_MAP[code];
}

/** The class a code belongs to, including codes outside the registry. */
export function statusClass(code: number): HttpStatusClass | null {
  if (code < 100 || code > 599) return null;
  return (`${Math.floor(code / 100)}xx`) as HttpStatusClass;
}

/** Group the whole dataset for rendering, in category then numeric order. */
export function statusesByCategory(): Array<{ category: HttpStatusCategory; statuses: HttpStatus[] }> {
  return HTTP_STATUS_CATEGORIES.map((category) => ({
    category,
    statuses: HTTP_STATUSES.filter((s) => s.category === category.id).sort(
      (a, b) => a.code - b.code,
    ),
  }));
}

/**
 * Search by code, reason phrase or keyword.
 *
 * A bare number is treated as a code prefix, so "40" lists the whole 40x run
 * and "4" lists every client error — which is what someone half-remembering a
 * code actually wants. Anything else is matched against the name, the
 * explanations and the keyword list.
 */
export function searchStatuses(query: string): HttpStatus[] {
  const term = query.trim().toLowerCase();
  if (!term) return [...HTTP_STATUSES];

  if (/^\d{1,3}$/.test(term)) {
    const exact = HTTP_STATUS_MAP[Number(term)];
    const prefixed = HTTP_STATUSES.filter((s) => String(s.code).startsWith(term));
    // An exact hit always leads, even though it also matches as a prefix.
    return exact ? [exact, ...prefixed.filter((s) => s.code !== exact.code)] : prefixed;
  }

  return HTTP_STATUSES.filter((s) => {
    const haystack = [
      String(s.code),
      s.name,
      s.meaning,
      s.whenToSend,
      s.confusion ?? '',
      ...(s.keywords ?? []),
    ]
      .join(' ')
      .toLowerCase();
    return term.split(/\s+/).every((word) => haystack.includes(word));
  });
}
