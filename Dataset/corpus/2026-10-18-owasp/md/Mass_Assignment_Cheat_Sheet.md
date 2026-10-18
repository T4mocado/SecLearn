# Mass_Assignment_Cheat_Sheet

## Mass Assignment Cheat Sheet
## Introduction
## Definition
Software frameworks sometimes allow developers to automatically bind HTTP request parameters into program
code variables or objects to make using that framework easier on developers. This can sometimes cause harm.
Attackers can sometimes use this methodology to create new parameters that the developer never intended which
in turn creates or overwrites new variable or objects in program code that was not intended.
This is called a Mass Assignment vulnerability.

## Alternative Names
Depending on the language/framework in question, this vulnerability can have several alternative names:
Mass Assignment: Ruby on Rails, NodeJS.
Autobinding: Spring MVC, ASP NET MVC.
Object injection: PHP.
## Example
Suppose there is a form for editing a user's account information:
<form>
<input name="userid" type="text">
<input name="password" type="text">
<input name="email" text="text">
<input type="submit">
</form>
Here is the object that the form is binding to:
public class User {
private String userid;
private String password;
private String email;
private boolean isAdmin;
//Getters & Setters
}
Here is the controller handling the request:
@RequestMapping(value = "/addUser", method = RequestMethod.POST)
public String submit(User user) {
userService.add(user);
return "successPage";
}
Here is the typical request:
POST /addUser
...
userid=bobbytables&password=hashedpass&email=bobby@tables.com
And here is the exploit in which we set the value of the attribute isAdmin of the instance of the class User:
POST /addUser
...
userid=bobbytables&password=hashedpass&email=bobby@tables.com&isAdmin=true
## Exploitability
Mass assignment is exploitable when attacker-controlled input can initialize or update fields that the caller is not
authorized to change, such as a role or account owner. Field names may be guessed or discovered; source-code
access is not required. CWE-915 defines the weakness in terms of insufficient control over writable attributes.
An empty constructor is not a general prerequisite. For example, Spring supports both constructor and setter
binding. Review which inputs the binding mechanism exposes, including nested objects.

## GitHub case study
In 2012, GitHub was hacked using mass assignment. A user was able to upload his public key to any
organization and thus make any subsequent changes in their repositories. GitHub's Blog Post.
## Solutions
Prefer dedicated input objects, such as Data Transfer Objects (DTOs), containing only fields the caller may
edit; see Spring's model design guidance.
Explicitly allow-list fields when binding to an object with additional properties.
Do not rely on a block-list as the sole protection: a new or overlooked sensitive field remains bindable.
CWE-915 recommends allowlists over denylists. The block-list examples below illustrate mechanisms
encountered in existing applications, not the recommended design.
DTOs and field allowlists restrict writable properties; they do not replace authorization for the requested object
and operation.
## General Solutions
An architectural approach is to create Data Transfer Objects and avoid binding input directly to domain objects.
Only the fields that are meant to be editable by the user are included in the DTO.
public class UserRegistrationFormDTO {
private String userid;
private String password;
private String email;
//NOTE: isAdmin field is not present
//Getters & Setters
}
## Language & Framework specific solutions
## Spring MVC
## Allow-listing
@Controller
public class UserController
{
@InitBinder
public void initBinder(WebDataBinder binder, WebRequest request)
{
binder.setAllowedFields("userid", "password", "email");
}
...
}
See Spring's model design guidance for dedicated input objects and allowed fields.
## Block-listing
Spring describes disallowedFields as fragile because fields can be missed or added later. Prefer the allow-list
above; this example only excludes the named property.

@Controller
public class UserController
{
@InitBinder
public void initBinder(WebDataBinder binder, WebRequest request)
{
binder.setDisallowedFields("isAdmin");
}
...
}
See the Spring data binding limitations.
## NodeJS + Mongoose
## Allow-listing
var UserSchema = new mongoose.Schema({
userid: String,
password: String,
email : String,
isAdmin : Boolean,
});
UserSchema.statics = {
User.userCreateSafeFields: ['userid', 'password', 'email']
};
var User = mongoose.model('User', UserSchema);
_ = require('underscore');
var user = new User(_.pick(req.body, User.userCreateSafeFields));
Take a look here for the documentation.
## Block-listing
var massAssign = require('mongoose-mass-assign');
var UserSchema = new mongoose.Schema({
userid: String,
password: String,
email : String,
isAdmin : { type: Boolean, protect: true, default: false }
});
UserSchema.plugin(massAssign);
var User = mongoose.model('User', UserSchema);
/** Static method, useful for creation **/
var user = User.massAssign(req.body);
/** Instance method, useful for updating**/
var user = new User;
user.massAssign(req.body);
/** Static massUpdate method **/
var input = { userid: 'bhelx', isAdmin: 'true' };
User.update({ '_id': someId }, { $set: User.massUpdate(input) }, console.log);

Take a look here for the documentation.
## Ruby On Rails
Take a look here for the documentation.
## Django
Take a look here for the documentation.
## ASP NET
Take a look here for the documentation.
## PHP Laravel + Eloquent
## Allow-listing
<?php
namespace App;
use Illuminate\Database\Eloquent\Model;
class User extends Model
{
private $userid;
private $password;
private $email;
private $isAdmin;
protected $fillable = array('userid','password','email');
}
Take a look here for the documentation.
## Block-listing
<?php
namespace App;
use Illuminate\Database\Eloquent\Model;
class User extends Model
{
private $userid;
private $password;
private $email;
private $isAdmin;
protected $guarded = array('isAdmin');
}
Take a look here for the documentation.
## Grails

Take a look here for the documentation.
## Play
Take a look here for the documentation.
## Jackson (JSON Object Mapper)
Take a look here and here for the documentation.
## GSON (JSON Object Mapper)
Take a look here and here for the document.
## JSON-Lib (JSON Object Mapper)
Take a look here for the documentation.
## Flexjson (JSON Object Mapper)
Take a look here for the documentation.
## References
Ruby on Rails: Strong Parameters
Spring Framework: DataBinder Security Considerations