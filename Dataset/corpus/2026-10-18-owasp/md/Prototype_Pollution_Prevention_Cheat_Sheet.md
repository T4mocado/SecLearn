# Prototype_Pollution_Prevention_Cheat_Sheet

## Prototype Pollution Prevention Cheat Sheet
## Explanation
Prototype Pollution is a critical vulnerability that can allow attackers to manipulate an application's JavaScript
objects and properties, leading to serious security issues such as unauthorized access to data, privilege escalation,
and even remote code execution.
For examples of why this is dangerous, see the links in the Other resources section below.
## Suggested protection mechanisms
## Use "new Set()" or "new Map()"
Developers should use new Set() or new Map() instead of using object literals:
let allowedTags = new Set();
allowedTags.add('b');
if(allowedTags.has('b')){
//...
}
let options = new Map();
options.set('spaces', 1);
let spaces = options.get('spaces')
## If objects or object literals are required
If objects have to be used then they should be created using the Object.create(null) API to ensure they don't
inherit from the Object prototype:
let obj = Object.create(null);
If object literals are required then as a last resort you could use the __proto__ property:
let obj = {__proto__:null};
## Use object "freeze" and "seal" mechanisms
Freezing built-in prototypes with Object.freeze() prevents adding or removing their properties and makes
existing data properties non-writable. Freezing is shallow: objects referenced by those properties remain mutable
unless separately frozen. Test compatibility first, because libraries that modify built-in prototypes can break.
Object.seal() only prevents adding or removing properties and changing their configuration; existing writable
property values can still change. Do not rely on sealing to prevent those modifications.
## Node.js configuration flag
Node.js also offers the ability to remove the __proto__ property completely using the --disable-proto=delete
flag. Note this is a defense in depth measure.
Prototype pollution is still possible using constructor.prototype properties but removing __proto__ helps
reduce attack surface and prevent certain attacks.

## Other resources
What is prototype pollution? (Portswigger Web Security Academy)
Prototype pollution (Snyk Learn)
## Credits
Credit to Gareth Hayes for providing the original protection guidance in this comment.
## References
MDN: JavaScript prototype pollution
Node.js: Command-line API