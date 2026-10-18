# GraphQL_Cheat_Sheet

## GraphQL Cheat Sheet
## Introduction
GraphQL is an open source query language originally developed by Facebook that can be used to build APIs as
an alternative to REST and SOAP. It has gained popularity since its inception in 2012 because of the native
flexibility it offers to those building and calling the API. There are GraphQL servers and clients implemented in
various languages. Many companies use GraphQL including GitHub, Credit Karma, Intuit, and PayPal.
This Cheat Sheet provides guidance on the various areas that need to be considered when working with
GraphQL:
Apply proper input validation checks on all incoming data.
Expensive queries will lead to Denial of Service (DoS), so add checks to limit or prevent queries that are
too expensive.
Ensure that the API has proper access control checks.
Disable insecure default configurations (e.g. excessive errors, introspection, GraphiQL, etc.).
## Common Attacks
Injection - this usually includes but is not limited to:
SQL and NoSQL injection

OS Command injection
SSRF and CRLF injection/Request Smuggling
DoS (Denial of Service)
Abuse of broken authorization: either improper or excessive access, including IDOR
Batching Attacks, a GraphQL-specific method of brute force attack
Abuse of insecure default configurations
## Best Practices and Recommendations
For the original security analysis, see Doyensec's GraphQL security overview.
## Input Validation
Adding strict input validation can help prevent against injection and DoS. The main design for GraphQL is that
the user supplies one or more identifiers and the backend has a number of data fetchers making HTTP, DB, or
other calls using the given identifiers. This means that user input will be included in HTTP requests, DB queries,
or other requests/calls which provides opportunity for injection that could lead to various injection attacks or
DoS.
See the OWASP Cheat Sheets on Input Validation and general injection prevention for full details to best perform
input validation and prevent injection.
## General Practices
Validate all incoming data to only allow valid values (i.e. allowlist).
Use specific GraphQL data types such as scalars or enums. Write custom GraphQL validators for more
complex validations. Custom scalars may also come in handy.
Define schemas for mutations input.
List allowed characters - don't use a denylist
The stricter the list of allowed characters the better. A lot of times a good starting point is only
allowing alphanumeric, non-unicode characters because it will disallow many attacks.
To properly handle unicode input, use a single internal character encoding
Gracefully reject invalid input, being careful not to reveal excessive information about how the API and its
validation works.
## Injection Prevention
When handling input meant to be passed to another interpreter (e.g. SQL/NoSQL/ORM, OS, LDAP, XML):
Always choose libraries/modules/packages offering safe APIs, such as parameterized statements.
Ensure that you follow the documentation so you are properly using the tool
Using ORMs and ODMs are a good option but they must be used properly to avoid flaws such as
ORM injection.
If such tools are not available, always escape/encode input data according to best practices of the target
interpreter
Choose a well-documented and actively maintained escaping/encoding library. Many languages and
frameworks have this functionality built-in.
For more information see the below pages:
SQL Injection Prevention
NoSQL Injection Prevention

LDAP Injection Prevention
OS Command Injection Prevention
XML Security and XXE Injection Prevention
## Process Validation
When using user input, even if sanitized and/or validated, it should not be used for certain purposes that would
give a user control over data flow. For example, do not make an HTTP/resource request to a host that the user
supplies (unless there is an absolute business need).
## DoS Prevention
DoS is an attack against the availability and stability of the API that can make it slow, unresponsive, or
completely unavailable. This CS details several methods to limit the possibility of a DoS attack at the application
level and other layers of the tech stack. There is also a CS dedicated to the topic of DoS.
Here are recommendations specific to GraphQL to limit the potential for DoS:
Add depth limiting to incoming queries
Add amount limiting to incoming queries
Add pagination to limit the amount of data that can be returned in a single response
Add reasonable timeouts at the application layer, infrastructure layer, or both
Consider performing query cost analysis and enforcing a maximum allowed cost per query
Enforce rate limiting on incoming requests per IP or user (or both) to prevent basic DoS attacks
Implement the batching and caching technique on the server-side (Facebook's DataLoader can be used for
this)
## Query Limiting (Depth & Amount)
In GraphQL each query has a depth (e.g. nested objects) and each object requested in a query can have an
amount specified (e.g. 99999999 of an object). By default these can both be unlimited which may lead to a DoS.
You should set limits on depth and amount to prevent DoS, but this usually requires a small custom
implementation as it is not natively supported by GraphQL. See this and this page for more information about
these attacks and how to add depth and amount limiting. Adding pagination can also help performance.
APIs using graphql-java can utilize the built-in MaxQueryDepthInstrumentation for depth limiting. APIs using
JavaScript can use graphql-depth-limit to implement depth limiting and graphql-input-number to implement
amount limiting.
Here is an example of a GraphQL query with depth N:
query evil { 	# Depth: 0
album(id: 42) { 	# Depth: 1
songs { 	# Depth: 2
album { 	# Depth: 3
... 	# Depth: ...
album {id: N} # Depth: N
}
}
}
}
Here is an example of a GraphQL query requesting 99999999 of an object:
query {
author(id: "abc") {

posts(first: 99999999) {
title
}
}
}
## Timeouts
Adding timeouts can be a simple way to limit how many resources any single request can consume. But timeouts
are not always effective since they may not activate until a malicious query has already consumed excessive
resources. Timeout requirements will differ by API and data fetching mechanism; there isn't one timeout value
that will work across the board.
At the application level, timeouts can be added for queries and resolver functions. This option is usually more
effective since the query/resolution can be stopped once the timeout is reached. GraphQL does not natively
support query timeouts so custom code is required. See this blog post for more about using timeouts with
GraphQL or the two examples below.
JavaScript Timeout Example
Code snippet from this SO answer:
request.incrementResolverCount = function () {
var runTime = Date.now() - startTime;
if (runTime > 10000) { // a timeout of 10 seconds
if (request.logTimeoutError) {
logger('ERROR', `Request ${request.uuid} query execution timeout`);
}
request.logTimeoutError = false;
throw 'Query execution has timeout. Field resolution aborted';
}
this.resolverCount++;
};
Java Timeout Example using Instrumentation
public class TimeoutInstrumentation extends SimpleInstrumentation {
@Override
public DataFetcher<?> instrumentDataFetcher(
DataFetcher<?> dataFetcher, InstrumentationFieldFetchParameters parameters
) {
return environment ->
Observable.fromCallable(() -> dataFetcher.get(environment))
.subscribeOn(Schedulers.computation())
.timeout(10, TimeUnit.SECONDS) // timeout of 10 seconds
.blockingFirst();
}
}
Infrastructure Timeout
Another option to add a timeout that is usually easier is adding a timeout on an HTTP server (Apache/httpd,
nginx), reverse proxy, or load balancer. However, infrastructure timeouts are often inaccurate and can be
bypassed more easily than application-level ones.
## Query Cost Analysis
Query cost analysis involves assigning costs to the resolution of fields or types in incoming queries so that the
server can reject queries that cost too much to run or will consume too many resources. This is not easy to

implement and may not always be necessary but it is the most thorough approach to preventing DoS. See "Query
Cost Analysis" in this blog post for more details on implementing this control.
Apollo recommends:
Before you go ahead and spend a ton of time implementing query cost analysis be certain you
need it. Try to crash or slow down your staging API with a nasty query and see how far you get —
maybe your API doesn’t have these kinds of nested relationships, or maybe it can handle fetching
thousands of records at a time perfectly fine and doesn’t need query cost analysis!
APIs using graphql-java can utilize the built-in MaxQueryComplexityInstrumentationto to enforce max query
complexity. APIs using JavaScript can utilize graphql-cost-analysis or graphql-validation-complexity to enforce
max query cost.
## Rate Limiting
Limit incoming HTTP requests per client using a request-rate control, such as Nginx's limit_req module.
Apache's mod_ratelimit limits the transfer bandwidth of each response; it does not limit incoming request counts
or aggregate traffic per client.
HTTP request counts alone do not account for expensive queries or multiple operations in one request. Apply
GraphQL rate limits in the business logic layer, together with query cost limits and batching limits.
## Server-side Batching and Caching
To increase efficiency of a GraphQL API and reduce its resource consumption, the batching and caching
technique can be used to prevent making duplicate requests for pieces of data within a small time frame.
Facebook's DataLoader tool is one way to implement this.
## System Resource Management
Not properly limiting the amount of resources your API can use (e.g. CPU or memory), may compromise your
API responsiveness and availability, leaving it vulnerable to DoS attacks. Some limiting can be done at the
operating system level.
On Linux, a combination of Control Groups(cgroups), User Limits (ulimits), and Linux Containers (LXC) can be
used.
However, containerization platforms tend to make this task much easier. See the resource limiting section in the
Docker Security Cheat Sheet for how to prevent DoS when using containers.
## Access Control
To ensure that a GraphQL API has proper access control, do the following:
Always validate that the requester is authorized to view or mutate/modify the data they are requesting.
This can be done with RBAC or other access control mechanisms.
This will prevent IDOR issues, including both BOLA and BFLA.
Enforce authorization checks on both edges and nodes (see example bug report where nodes did not have
authorization checks but edges did).
Use Interfaces and Unions to create structured, hierarchical data types which can be used to return more or
fewer object properties, according to requester permissions.

Query and Mutation Resolvers can be used to perform access control validation, possibly using some
RBAC middleware.
Disable introspection queries system-wide in any production or publicly accessible environments.
Disable GraphiQL and other similar schema exploration tools in production or publicly accessible
environments.
## General Data Access
It's commonplace for GraphQL requests to include one or more direct IDs of objects in order to fetch or modify
them. For example, a request for a certain picture may include the ID that is actually the primary key in the
database for that picture. As with any request, the server must verify that the caller has access to the object they
are requesting. But sometimes developers make the mistake of assuming that possession of the object's ID means
the caller should have access. Failure to verify the requester's access in this case is called Broken Object Level
Authentication, also known as IDOR.
It's possible for a GraphQL API to support access to objects using their ID even if that is not intended.
Sometimes there are node or nodes or both fields in a query object, and these can be used to access objects
directly by ID. You can check whether your schema has these fields by running this on the command-line
(assuming that schema.json contains your GraphQL schema): cat schema.json | jq ".data.__schema.types[]
| select(.name==\"Query\") | .fields[] | .name" | grep node. Removing these fields from the schema
should disable the functionality, but you should always apply proper authorization checks to verify the caller has
access to the object they are requesting.
## Query Access (Data Fetching)
Detectify's New Relic disclosure illustrates why field access must respect account permissions.
As part of a GraphQL API there will be various data fields that can be returned. One thing to consider is if you
want different levels of access around these fields. For example, you may only want certain consumers to be able
to fetch certain data fields rather than allowing all consumers to be able to retrieve all available fields. This can
be done by adding a check in the code to ensure that the requester should be able to read a field they are trying to
fetch.
## Mutation Access (Data Manipulation)
For an original case study, see Pen Test Partners' WordPress GraphQL disclosure.
GraphQL supports mutation, or manipulation of data, in addition to its most common use case of data fetching. If
an API implements/allows mutation then there may need to be access controls put in place to restrict which
consumers, if any, can modify data through the API. Setups that require mutation access control would include
APIs where only read access is intended for requesters or where only certain parties should be able to modify
certain fields.
## Batching Attacks
GraphQL supports batching requests, also known as query batching. This lets callers to either batch multiple
queries or batch requests for multiple object instances in a single network call, which allows for what is called a
batching attack. This is a form of brute force attack, specific to GraphQL, that usually allows for faster and less
detectable exploits. Here is the most common way to do query batching:
[
{
query: < query 0 >,
variables: < variables for query 0 >,

},
{
query: < query 1 >,
variables: < variables for query 1 >,
},
{
query: < query n >
variables: < variables for query n >,
}
]
And here is an example query of a single batched GraphQL call requesting multiple different instances of the
droid object:
query {
droid(id: "2000") {
name
}
second:droid(id: "2001") {
name
}
third:droid(id: "2002") {
name
}
}
In this case it could be used to enumerate every possible droid object that is stored on the server in very few
network requests as opposed to a standard REST API where the requester would need to submit a different
network request for every different droid ID they want to request. This type of attack can lead to the following
issues:
Application-level DoS attacks - A high number of queries or object requests in a single network call could
cause a database to hang or exhaust other available resources (e.g. memory, CPU, downstream services).
Enumeration of objects on the server, such as users, emails, and user IDs.
Brute forcing passwords, 2 factor authentication codes (OTPs), session tokens, or other sensitive values.
WAFs, RASPs, IDS/IPS, SIEMs, or other security tooling will likely not detect these attacks since they
only appear to be one single request rather than an a massive amount of network traffic.
This attack will likely bypass existing rate limits in tools like Nginx or other proxies/gateways since they
rely on looking at the raw number of requests.
## Mitigating Batching Attacks
In order to mitigate this type of attack you should put limits on incoming requests at the code level so that they
can be applied per request. There are 3 main options:
Add object request rate limiting in code
Prevent batching for sensitive objects
Limit the number of queries that can run at one time
One option is to create a code-level rate limit on how many objects that callers can request. This means the
backend would track how many different object instances the caller has requested, so that they will be blocked
after requesting too many objects even if they batch the object requests in a single network call. This replicates a
network-level rate limit that a WAF or other tool would do.
Another option is to prevent batching for sensitive objects that you don't want to be brute forced, such as
usernames, emails, passwords, OTPs, session tokens, etc. This way an attacker is forced to attack the API like a
REST API and make a different network call per object instance. This is not supported natively so it will require

a custom solution. However once this control is put in place other standard controls will function normally to
help prevent any brute forcing.
Limiting the number of operations that can be batched and run at once is another option to mitigate GraphQL
batching attacks leading to DoS. This is not a silver bullet though and should be used in conjunction with other
methods.
## Secure Configurations
By default, most GraphQL implementations have some insecure default configurations which should be
changed:
Don't return excessive error messages (e.g. disable stack traces and debug mode).
Disable or restrict Introspection and GraphiQL based on your needs.
Suggestion of mis-typed fields if the introspection is disabled
## Introspection + GraphiQL
GraphQL Often comes by default with introspection and/or GraphiQL enabled and not requiring authentication.
This allows the consumer of your API to learn everything about your API, schemas, mutations, deprecated fields
and sometimes unwanted "private fields".
This might be an intended configuration if your API is designed to be consumed by external clients, but can also
be an issue if the API was designed to be used internally only. Although security by obscurity is not
recommended, it might be a good idea to consider removing the Introspection to avoid any leak. If your API is
publicly consumed, you might want to consider disabling it for not authenticated or unauthorized users.
For internal API, the easiest approach is to just disable introspection system-wide. See this page or consult your
GraphQL implementation's documentation to learn how to disable introspection altogether. If your
implementation does not natively support disabling introspection or if you would like to allow some
consumers/roles to have this access, you can build a filter in your service to only allow approved consumers to
access the introspection system.
Keep in mind that even if introspection is disabled, attackers can still guess fields by brute forcing them.
Furthermore, GraphQL has a built-in feature to return a hint when a field name that the requester provides is
similar (but incorrect) to an existing field (e.g. request has usr and the response will ask Did you mean "user?").
You should consider disabling this feature if you have disabled the introspection, to decrease the exposure, but
not all implementations of GraphQL support doing so. Shapeshifter is one tool that should be able to do this.
Disable Introspection - Java
GraphQLSchema schema = GraphQLSchema.newSchema()
.query(StarWarsSchema.queryType)
.fieldVisibility( NoIntrospectionGraphqlFieldVisibility.NO_INTROSPECTION_FIELD_VISIBILITY )
.build();
Disable Introspection & GraphiQL - JavaScript
For existing applications using the deprecated express-graphql middleware, this illustration assumes
NoIntrospection is an imported introspection-denying validation rule. Use a maintained server implementation
for new applications.
app.use('/graphql', graphqlHTTP({
schema: MySessionAwareGraphQLSchema,
validationRules: [NoIntrospection],

graphiql: process.env.NODE_ENV === 'development',
}));
## Don't Return Excessive Errors
GraphQL APIs in production shouldn't return stack traces or be in debug mode. Doing this is implementation
specific, but using middleware is one popular way to have better control over errors the server returns. To omit
stack traces with Apollo Server, pass includeStacktraceInErrorResponses: false to its constructor. When this
option is unspecified, NODE_ENV=production or NODE_ENV=test suppresses stack traces by default; error messages
still require separate masking. However, if you would like to log the stack trace internally without returning it to
the user see here for how to mask and log errors so they are available to the developers but not callers of the API.
## References
GraphQL: Security
GraphQL: Authorization