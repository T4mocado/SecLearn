# REST_Assessment_Cheat_Sheet

## REST Assessment Cheat Sheet
## About RESTful Web Services
Web Services are an implementation of web technology used for machine to machine communication. As such
they are used for Inter application communication, Web 2.0 and Mashups and by desktop and mobile
applications to call a server.
RESTful web services (often called simply REST) are a light weight variant of Web Services based on the
RESTful design pattern. In practice RESTful web services utilizes HTTP requests that are similar to regular
HTTP calls in contrast with other Web Services technologies such as SOAP which utilizes a complex protocol.
## Key relevant properties of RESTful web services
Use of HTTP methods (GET, POST, PUT and DELETE) as the primary verb for the requested operation.
Non-standard parameters specifications:
As part of the URL.
In headers.
Structured parameters and responses using JSON or XML in a parameter values, request body or response
body. Those are required to communicate machine useful information.
Custom authentication and session management, often utilizing custom security tokens: this is needed as
machine to machine communication does not allow for login sequences.
Lack of formal documentation. A proposed standard for describing RESTful web services called WADL
was submitted by Sun Microsystems but was never officially adapted.
## The challenge of security testing RESTful web services
Inspecting the application does not reveal the attack surface, I.e. the URLs and parameter structure used by
the RESTful web service. The reasons are:
No application utilizes all the available functions and parameters exposed by the service
Those used are often activated dynamically by client side code and not as links in pages.
The client application is often not a web application and does not allow inspection of the activating
link or even relevant code.
The parameters are non-standard making it hard to determine what is just part of the URL or a constant
header and what is a parameter worth fuzzing.
As a machine interface the number of parameters used can be very large, for example a JSON structure
may include dozens of parameters. fuzzing each one significantly lengthen the time required for testing.
Custom authentication mechanisms require reverse engineering and make popular tools not useful as they
cannot track a login session.
## How to pentest a RESTful web service
Determine the attack surface through documentation - RESTful pen testing might be better off if some level of
clear-box testing is allowed and you can get information about the service.
This information will ensure fuller coverage of the attack surface. Such information to look for:

Formal service description - While for other types of web services such as SOAP a formal description,
usually in WSDL is often available, this is seldom the case for REST. That said, either WSDL 2.0 or
WADL can describe REST and are sometimes used.
A developer guide for using the service may be less detailed but will commonly be found, and might even
be considered opaque-box testing.
Application source or configuration - in many frameworks, including dotNet ,the REST service definition
might be easily obtained from configuration files rather than from code.
Collect full requests using a proxy - while always an important pen testing step, this is more important for REST
based applications as the application UI may not give clues on the actual attack surface.
Note that the proxy must be able to collect full requests and not just URLs as REST services utilize more than
just GET parameters.
Analyze collected requests to determine the attack surface:
Look for non-standard parameters:
Look for abnormal HTTP headers - those would many times be header based parameters.
Determine if a URL segment has a repeating pattern across URLs. Such patterns can include a date,
a number or an ID like string and indicate that the URL segment is a URL embedded parameter.
For example: http://server/srv/2013-10-21/use.php
Look for structured parameter values - those may be JSON, XML or a non-standard structure.
If the last element of a URL does not have an extension, it may be a parameter. This is especially
true if the application technology normally uses extensions or if a previous segment does have an
extension.
For example: http://server/svc/Grid.asmx/GetRelatedListItems
Look for highly varying URL segments - a single URL segment that has many values may be
parameter and not a physical directory.
For example if the URL http://server/src/XXXX/page repeats with hundreds of value for
XXXX, chances XXXX is a parameter.
Verify non-standard parameters: in some cases (but not all), setting the value of a URL segment suspected of
being a parameter to a value expected to be invalid can help determine if it is a path elements of a parameter. If a
path element, the web server will return a 404 message, while for an invalid value to a parameter the answer
would be an application level message as the value is legal at the web server level.
Analyzing collected requests to optimize fuzzing - after identifying potential parameters to fuzz, analyze the
collected values for each to determine:
Valid vs. invalid values, so that fuzzing can focus on marginal invalid values.
For example sending 0 for a value found to be always a positive integer.
Sequences allowing to fuzz beyond the range presumably allocated to the current user.
Lastly, when fuzzing, don't forget to emulate the authentication mechanism used.
## Assessing OpenAPI and Swagger-Based REST APIs
Modern REST APIs commonly publish a machine-readable description in OpenAPI (formerly Swagger). Unlike
the WADL option noted above, this format is widely adopted, and for an assessment it is the fastest route to the
attack surface.
Probe the common description locations first - /openapi.json, /swagger.json and /docs - before relying
only on traffic captured through a proxy. The description lists paths, methods, parameters, schemas and
security requirements in one place.

Reconcile the description with observed behavior. Call endpoints the description does not mention and
send fields the schema does not define; an undocumented field the API accepts is a discrepancy to
investigate, not proof of a contract violation, because additional properties may be valid depending on the
intended schema and its documentation. Compare what you observed with the intended schema and the
authorization policy before treating the field as a violation (see mass assignment below).
Fuzz from the schema: start with a valid request that satisfies the declared types, required fields and enum
values, then mutate one constraint at a time, following the same fuzzing approach used above.
Build the per-operation security test matrix from the effective OpenAPI security requirements, which are
the root-level requirements unless the operation declares its own security, in which case that declaration
replaces them instead of combining with them: no credentials, a valid token, and a token that lacks the
declared requirement (see the next section). securitySchemes only define the reusable security mechanisms
those requirements refer to.
## JWT and OAuth2 Assessment
A REST API is only as strong as the token checks in front of it, so test the token handling itself before testing the
endpoints behind it.
Tamper with the token: change a claim in the payload, re-sign it with a key you control, or remove the
signature, and confirm the API rejects it. Also try alg: none and algorithm confusion. The corresponding
server-side rules are in the JSON Web Token Cheat Sheet and the REST Security Cheat Sheet, with the
threat background in RFC 8725.
Send a token that is expired (exp), not yet valid (nbf), or issued for another issuer (iss) or audience (aud).
These standard claims must be checked against the configuration of the API rather than trusted as
presented.
Send malformed tokens - truncated or extra parts, invalid Base64 or JSON - and confirm the API returns
an authentication failure instead of a server error or a partially parsed token.
Check scope and role enforcement: call each operation with a valid token whose OAuth 2.0 scope does not
grant it, and with a valid token belonging to a lower-privileged role that lacks permission for it. Both
should be denied the result, on read and write operations alike, with the status code that the documented
response policy of the API prescribes for such a denial: for example 401 Unauthorized or 403 Forbidden as
described for bearer requests in RFC 6750 Section 3.1, or 404 Not Found when the API conceals the
existence of the resource.
## Broken Object Level Authorization (BOLA)
Broken Object Level Authorization is the API form of IDOR: an endpoint uses an identifier from the request
without checking that the caller may access the object it points at.
Run the swap test: create the same kind of object with two accounts or tenants, then replay each request
under the other session's identifiers. Cover reads and writes (GET, PUT, PATCH, DELETE); an ownership check
on GET next to an unchecked PUT on the same resource is a common result.
Prefer identifiers the other session can already observe - list responses, error messages, notification links -
over guessing, and include nested routes such as /users/{id}/orders/{id}, where authorization is often
only enforced for the outer resource.
Test vertical escalation too: use a low-privilege token against owner-only or administrator-only operations
of the same API; whether a role may call such an operation at all is Broken Function Level Authorization,
a separate check from BOLA's per-object access.
Repeat for every object type the API exposes; the object is wherever an identifier in the request ends up,
not only in the obvious profile or order endpoints.
Prevention guidance is in the Insecure Direct Object Reference Prevention Cheat Sheet and the Authorization
Cheat Sheet; test methodology is in the WSTG IDOR test.

## Mass Assignment in JSON APIs
Frameworks that bind a JSON request body directly to an internal object make mass assignment testable with a
single request: anything the client sends may be written, including fields the API never advertised.
Take a normal create or update request and add fields outside the contract - a role, a verification flag, an
internal identifier - then read the object back to see whether they were stored. Repeat for nested objects
and arrays and for each update verb, including partial-update endpoints.
Confirm effect, not just reflection: a field echoed in the response means little until a following request
shows that it persisted and changed behavior.
Treat every field the server accepts but the schema does not define as a candidate for this test (see the
OpenAPI section above).
See CWE-915 for the weakness classification.
## Rate Limiting and Throttling Assessment
Missing or weak limits let an attacker guess credentials, harvest data or consume capacity at will; this is
API4:2023 Unrestricted Resource Consumption.
Drive the authentication, token and account recovery endpoints and check that throttling engages; without
it, password guessing and credential stuffing remain cheap. Compare with the login throttling expectations
for web applications.
Exercise the expensive operations - search, export, bulk writes - and note whether a limit applies to them at
all. Throttling by request frequency does not by itself bound the amount of work performed within a single
request, so check what one request can cost as well.
Identify what the limit is keyed on: a per-IP limit is worked around by changing address, so per-account or
per-API-key limits must still hold, and an authenticated session must not disable them.
Record the observed limit, the point at which it triggers and the response returned, so each finding states
the missing control precisely.
## Related Resources
See the REST Security Cheat Sheet for implementation guidance corresponding to these assessment topics.
## References
RFC 8725: JSON Web Token Best Current Practices
RFC 6750: OAuth 2.0 Bearer Token Usage