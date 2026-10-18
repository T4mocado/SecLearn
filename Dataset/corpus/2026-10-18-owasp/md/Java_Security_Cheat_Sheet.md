# Java_Security_Cheat_Sheet

## Java Security Cheat Sheet
## Injection Prevention in Java
This section aims to provide tips to handle Injection in Java application code.
Sample code used in tips is located here.
## What is Injection
Injection in OWASP Top 10 is defined as following:
Consider anyone who can send untrusted data to the system, including external users, internal users, and
administrators.
## General advice to prevent Injection
The following point can be applied, in a general way, to prevent Injection issue:
1. Apply Input Validation (using allowlist approach) combined with Output Sanitizing+Escaping on user
input/output.
2. If you need to interact with system, try to use API features provided by your technology stack (Java / .Net /
PHP...) instead of building command.

Additional advice is provided on this cheatsheet.
## Specific Injection types
Examples in this section will be provided in Java technology (see Maven project associated) but advice is
applicable to others technologies like .Net / PHP / Ruby / Python...
## SQL
## Symptom
Injection of this type occur when the application uses untrusted user input to build an SQL query using a String
and execute it.
## How to prevent
Use Query Parameterization in order to prevent injection.
## Example
/*No DB framework used here in order to show the real use of
Prepared Statement from Java API*/
/*Open connection with H2 database and use it*/
Class.forName("org.h2.Driver");
String jdbcUrl = "jdbc:h2:file:" + new File(".").getAbsolutePath() + "/target/db";
try (Connection con = DriverManager.getConnection(jdbcUrl)) {
/* Sample A: Select data using Prepared Statement*/
String query = "select * from color where friendly_name = ?";
List<String> colors = new ArrayList<>();
try (PreparedStatement pStatement = con.prepareStatement(query)) {
pStatement.setString(1, "yellow");
try (ResultSet rSet = pStatement.executeQuery()) {
while (rSet.next()) {
colors.add(rSet.getString(1));
}
}
}
/* Sample B: Insert data using Prepared Statement*/
query = "insert into color(friendly_name, red, green, blue) values(?, ?, ?, ?)";
int insertedRecordCount;
try (PreparedStatement pStatement = con.prepareStatement(query)) {
pStatement.setString(1, "orange");
pStatement.setInt(2, 239);
pStatement.setInt(3, 125);
pStatement.setInt(4, 11);
insertedRecordCount = pStatement.executeUpdate();
}
/* Sample C: Update data using Prepared Statement*/
query = "update color set blue = ? where friendly_name = ?";
int updatedRecordCount;
try (PreparedStatement pStatement = con.prepareStatement(query)) {
pStatement.setInt(1, 10);
pStatement.setString(2, "orange");
updatedRecordCount = pStatement.executeUpdate();
}

/* Sample D: Delete data using Prepared Statement*/
query = "delete from color where friendly_name = ?";
int deletedRecordCount;
try (PreparedStatement pStatement = con.prepareStatement(query)) {
pStatement.setString(1, "orange");
deletedRecordCount = pStatement.executeUpdate();
}
}
## References
SQL Injection Prevention Cheat Sheet
## JPA
## Symptom
Injection of this type occur when the application uses untrusted user input to build a JPA query using a String and
execute it. It's quite similar to SQL injection but here the altered language is not SQL but JPA QL.
## How to prevent
Use Java Persistence Query Language Query Parameterization in order to prevent injection.
## Example
EntityManager entityManager = null;
try {
/* Get a ref on EntityManager to access DB */
entityManager = Persistence.createEntityManagerFactory("testJPA").createEntityManager();
/* Define parameterized query prototype using named parameter to enhance readability */
String queryPrototype = "select c from Color c where c.friendlyName = :colorName";
/* Create the query, set the named parameter and execute the query */
Query queryObject = entityManager.createQuery(queryPrototype);
Color c = (Color) queryObject.setParameter("colorName", "yellow").getSingleResult();
} finally {
if (entityManager != null && entityManager.isOpen()) {
entityManager.close();
}
}
## References
SQLi and JPA
## Operating System
## Symptom
Injection of this type occur when the application uses untrusted user input to build an Operating System
command using a String and execute it.

## How to prevent
Use technology stack API in order to prevent injection.
## Example
/* The context taken is, for example, to perform a PING against a computer.
* The prevention is to use the feature provided by the Java API instead of building
* a system command as String and execute it */
InetAddress host = InetAddress.getByName("localhost");
var reachable = host.isReachable(5000);
## References
Command Injection
## XML: XPath Injection
## Symptom
Injection of this type occur when the application uses untrusted user input to build a XPath query using a String
and execute it.
## How to prevent
Use XPath Variable Resolver in order to prevent injection.
## Example
Variable Resolver implementation.
/**
* Resolver in order to define parameter for XPATH expression.
*
*/
public class SimpleVariableResolver implements XPathVariableResolver {
private final Map<QName, Object> vars = new HashMap<QName, Object>();
/**
* External methods to add parameter
*
* @param name Parameter name
* @param value Parameter value
*/
public void addVariable(QName name, Object value) {
vars.put(name, value);
}
/**
* {@inheritDoc}
*
* @see javax.xml.xpath.XPathVariableResolver#resolveVariable(javax.xml.namespace.QName)
*/
public Object resolveVariable(QName variableName) {
return vars.get(variableName);

}
}
Code using it to perform XPath query.
/*Create a XML document builder factory*/
DocumentBuilderFactory dbf = DocumentBuilderFactory.newInstance();
/*Disable External Entity resolution for different cases*/
//Do not performed here in order to focus on variable resolver code
//but do it for production code !
/*Load XML file*/
DocumentBuilder builder = dbf.newDocumentBuilder();
Document doc = builder.parse(new File("src/test/resources/SampleXPath.xml"));
/* Create and configure parameter resolver */
String bid = "bk102";
SimpleVariableResolver variableResolver = new SimpleVariableResolver();
variableResolver.addVariable(new QName("bookId"), bid);
/*Create and configure XPATH expression*/
XPath xpath = XPathFactory.newInstance().newXPath();
xpath.setXPathVariableResolver(variableResolver);
XPathExpression xPathExpression = xpath.compile("//book[@id=$bookId]");
/* Apply expression on XML document */
Object nodes = xPathExpression.evaluate(doc, XPathConstants.NODESET);
NodeList nodesList = (NodeList) nodes;
Element book = (Element)nodesList.item(0);
var containsRalls = book.getTextContent().contains("Ralls, Kim");
## References
XPATH Injection
## HTML/JavaScript/CSS
## Symptom
Injection of this type occur when the application uses untrusted user input to build an HTTP response and sent it
to browser.
## How to prevent
Use context-specific output encoding when displaying untrusted text. When the application intentionally accepts
HTML markup, use an HTML sanitization policy for the permitted elements and attributes. Input validation
enforces business rules; it does not replace these XSS controls. See the XSS Prevention Cheat Sheet for HTML,
attribute, JavaScript, and CSS context requirements.
## Example
// Illustrative business validation; output still needs the appropriate XSS control.
String userInput = "You user login is owasp-user01";
/* First we check that the value contains only expected character*/
if (!Pattern.matches("[a-zA-Z0-9\\s\\-]{1,50}", userInput))
{

return false;
}
// Plain text for an ordinary HTML body position, such as the content of a div.
String encodedText = Encode.forHtml(userInput);
// Allowed markup for an HTML body position; not for attributes, script, or style.
String outputToUser = "You <p>user login</p> is <strong>owasp-user01</strong>";
outputToUser += "<script>alert(22);</script><img src='#' onload='javascript:alert(23);'>";
/* Create a sanitizing policy that only allow tag '<p>' and '<strong>'*/
PolicyFactory policy = new HtmlPolicyBuilder().allowElements("p", "strong").toFactory();
/* Sanitize the output that will be sent to user*/
String safeOutput = policy.sanitize(outputToUser);
/* Keep the permitted markup: encoding this whole fragment would display tags as text. */
String finalSafeOutputExpected = "You <p>user login</p> is <strong>owasp-user01</strong>";
if (!finalSafeOutputExpected.equals(safeOutput))
{
return false;
}
## References
XSS
OWASP Java HTML Sanitizer
OWASP Java Encoder
Java RegEx
## LDAP
A dedicated cheatsheet has been created.
## NoSQL
## Symptom
Injection of this type occur when the application uses untrusted user input to build a NoSQL API call expression.
## How to prevent
Validate the expected input type, length, and business format, then use the driver's structured query API. Do not
concatenate untrusted values into query strings or accept client-supplied query/operator objects. MongoDB's
driver guidance distinguishes literal values built through typed APIs from JSON or JavaScript that is parsed as
query syntax. A blacklist of punctuation is not needed for the string equality query below. See the NoSQL
Security Cheat Sheet for broader controls.
## Example - MongoDB
Assume collection is an application-configured MongoCollection<Document>. This example uses the Java
driver's equality filter builder with a string value; the 50-character limit is an illustrative business rule, not the
injection defense.
String userInput = "Brooklyn";
if (userInput == null || userInput.length() > 50) {

throw new IllegalArgumentException("Invalid borough");
}
// Keep the field name fixed and the input as a string value.
Bson expression = Filters.eq("borough", userInput);
FindIterable<Document> restaurants = collection.find(expression);
## References
Testing for NoSQL injection
SQL and NoSQL Injection
No SQL, No Injection?
## Log Injection
## Symptom
Log Injection occurs when an application includes untrusted data in an application log message (e.g., an attacker
can cause an additional log entry that looks like it came from a completely different user, if they can inject CRLF
characters in the untrusted data). More information about this attack is available on the OWASP Log Injection
page.
## How to prevent
To prevent an attacker from writing malicious content into the application log, apply defenses such as:
Use structured log formats, such as JSON, instead of unstructured text formats. Unstructured formats are
susceptible to Carriage Return (CR) and Line Feed (LF) injection (see CWE-93).
Limit the size of the user input value used to create the log message.
Make sure all XSS defenses are applied when viewing log files in a web browser.
## Example using Log4j Core 2
The recommended logging policy for a production environment is sending logs to a network socket using the
structured JSON Template Layout introduced in Log4j 2.14.0 and truncate string values longer than 500
characters using the maxStringLength configuration attribute. The truncation suffix is appended after this limit;
this does not cap the encoded byte size or the total JSON document size:
<?xml version="1.0" encoding="UTF-8"?>
<Configuration xmlns="https://logging.apache.org/xml/ns"
xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
xsi:schemaLocation="
https://logging.apache.org/xml/ns
https://logging.apache.org/xml/ns/log4j-config-2.xsd">
<Appenders>
<Socket name="SOCKET"
host="localhost"
port="12345">
<!-- Truncate strings longer than 500 characters, then append the truncation suffix -->
<JsonTemplateLayout maxStringLength="500"
nullEventDelimiterEnabled="true"/>
</Socket>
</Appenders>
<Loggers>
<Root level="DEBUG">
<AppenderRef ref="SOCKET"/>
</Root>

</Loggers>
</Configuration>
See Integration with service-oriented architectures on Log4j website for more tips.
Usage of the logger at code level:
import org.apache.logging.log4j.LogManager;
import org.apache.logging.log4j.Logger;
...
// Most common way to declare a logger
private static final Logger logger = LogManager.getLogger();
// GOOD!
//
// Use parameterized logging to add user data to a message
// The pattern should be a compile-time constant
logger.warn("Login failed for user {}.", username);
// BAD!
//
// Don't mix string concatenation and parameters
// If `username` contains `{}`, the exception will leak into the message
logger.warn("Failure for user " + username + " and role {}.", role, ex);
...
See Log4j API Best Practices for more information.
## Example using Logback
The recommended logging policy for a production environment is using the structured JsonEncoder introduced
in Logback 1.3.8. In the example below, Logback is configured to roll on 10 log files of 5 MiB each:
<?xml version="1.0" encoding="UTF-8" ?>
<!DOCTYPE configuration>
<configuration>
<import class="ch.qos.logback.classic.encoder.JsonEncoder"/>
<import class="ch.qos.logback.core.rolling.FixedWindowRollingPolicy"/>
<import class="ch.qos.logback.core.rolling.RollingFileAppender"/>
<import class="ch.qos.logback.core.rolling.SizeBasedTriggeringPolicy"/>
<appender name="RollingFile" class="RollingFileAppender">
<file>app.log</file>
<rollingPolicy class="FixedWindowRollingPolicy">
<fileNamePattern>app-%i.log</fileNamePattern>
<minIndex>1</minIndex>
<maxIndex>10</maxIndex>
</rollingPolicy>
<triggeringPolicy class="SizeBasedTriggeringPolicy">
<maxFileSize>5MB</maxFileSize>
</triggeringPolicy>
<encoder class="JsonEncoder"/>
</appender>
<root level="DEBUG">
<appender-ref ref="RollingFile"/>
</root>
</configuration>
Usage of the logger at code level:
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
...

// Most common way to declare a logger
Logger logger = LoggerFactory.getLogger(MyClass.class);
// GOOD!
//
// Use parameterized logging to add user data to a message
// The pattern should be a compile-time constant
logger.warn("Login failed for user {}.", username);
// BAD!
//
// Don't mix string concatenation and parameters
// If `username` contains `{}`, the exception will leak into the message
logger.warn("Failure for user " + username + " and role {}.", role, ex);
...
## References
Log4j Core Configuration File
Log4j JSON Template Layout
Log4j Appenders
Logback Configuration File
Logback JsonEncoder
Logback Appenders
## Cryptography
## General cryptography guidance
Never, ever write your own cryptographic functions.
Wherever possible, try and avoid writing any cryptographic code at all. Instead try and either use pre-
existing secret management solutions or the secret management solution provided by your cloud provider.
For more information, see the OWASP Secrets Management Cheat Sheet.
If you cannot use a pre-existing secret management solution, try and use a trusted and well known
implementation library rather than using the libraries built into JCA/JCE as it is far too easy to make
cryptographic errors with them.
Make sure your application or protocol can easily support a future change of cryptographic algorithms.
Use your package manager wherever possible to keep all of your packages up to date. Watch the updates
on your development setup, and plan updates to your applications accordingly.
We will show examples below based on Google Tink, which is a library created by cryptography experts
for using cryptography safely (in the sense of minimizing common mistakes made when using standard
cryptography libraries).
## Encryption for storage
Follow the algorithm guidance in the OWASP Cryptographic Storage Cheat Sheet.
## Symmetric example using Google Tink
Google Tink has documentation on performing common tasks.
For example, this page (from Google's website) shows how to perform simple symmetric encryption.
The following code snippet shows an encapsulated use of this functionality:
Click here to view the "Tink symmetric encryption" code snippet.

## Symmetric example using built-in JCA/JCE classes
If you absolutely cannot use a separate library, it is still possible to use the built JCA/JCE classes but it is
strongly recommended to have a cryptography expert review the full design and code, as even the most trivial
error can severely weaken your encryption.
The following code snippet shows an example of using AES-GCM to perform encryption/decryption of data.
A few constraints/pitfalls with this code:
It does not take into account key rotation or management which is a whole topic in itself.
It is important to use a different nonce for every encryption operation, especially if the same key is used.
For more information, see this answer on Cryptography Stack Exchange.
The key will need to be stored securely.
Click here to view the "JCA/JCE symmetric encryption" code snippet.
## Encryption for transmission
Again, follow the algorithm guidance in the OWASP Cryptographic Storage Cheat Sheet.
## Asymmetric example using Google Tink
Google Tink has documentation on performing common tasks.
For example, this page (from Google's website) shows how to perform a hybrid encryption process where two
parties want to share data based on their asymmetric key pair.
The following code snippet shows how this functionality can be used to share secrets between Alice and Bob:
Click here to view the "Tink hybrid encryption" code snippet.
## Asymmetric example using built-in JCA/JCE classes
If you absolutely cannot use a separate library, it is still possible to use the built JCA/JCE classes but it is
strongly recommended to have a cryptography expert review the full design and code, as even the most trivial
error can severely weaken your encryption.
This Java 25+ example illustrates Elliptic Curve Diffie-Hellman (ECDH) followed by HKDF-SHA-256 and
AES-GCM. Do not use raw ECDH output directly as an AES key: RFC 5869 explains why Diffie-Hellman
values need extraction. The Java KDF API performs both extraction and expansion here. This is a primitive
demonstration, not an authenticated communication protocol.
Note that this code sample relies on the AesGcmSimple class from the previous section.
A few constraints/pitfalls with this code:
It does not take into account key rotation or management which is a whole topic in itself.
The code deliberately enforces a new nonce for every encryption operation but this must be managed as a
separate data item alongside the ciphertext.
The private keys will need to be stored securely.
The code does not consider the validation of public keys before use.
Public keys must be authenticated independently before use. HKDF does not authenticate the peer; this
example omits that protocol and its identity/context binding.

Click here to view the "JCA/JCE hybrid encryption" code snippet.
## References
Oracle: Secure Coding Guidelines for Java SE
Tink: Authenticated Encryption with Associated Data