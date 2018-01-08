/**
 * User model.
 *
 * @copyright (c) 2017 Passbolt SARL
 * @licence GNU Affero General Public License http://www.gnu.org/licenses/agpl-3.0.en.html
 */
var Config = require('./config');
var Settings = require('./settings').Settings;
var __ = require('../sdk/l10n').get;

// Will store temporarily the user master password if the user wants the
// system to remember it.
// Will be a json object with :
// - password: value of master password
// - created: timestamp when it was storeds
var _masterPassword = null;

/**
 * The class that deals with users.
 */
var User = function () {

  // see model/settings
  this.settings = new Settings();

  // reference to the user object returned by the server
  this._remote_user = {};

  // the fields
  this._user = {};

  // URLs
  this.URL_GET_REMOTE = '/users/me.json';
};

/**
 * Validate user fields individually
 *
 * @param field {string} The name of the field to validate
 * @param value {string} The value of the field to validate
 * @returns {boolean}
 * @throw Error if the field is not valid
 * @private
 */
User.prototype.__validate = function (field, value) {
  switch (field) {
    case 'firstname':
      if (typeof value === 'undefined' || value === '') {
        throw new Error(__('The first name cannot be empty'));
      }
      // if (!Validator.isAlphanumericSpecial(value)) {
      //   throw new Error(__('The first name should only contain alphabetical and numeric characters'))
      // }
      break;
    case 'lastname' :
      if (typeof value === 'undefined' || value === '') {
        throw new Error(__('The last name cannot be empty'));
      }
      // if (!Validator.isAlphanumericSpecial(value)) {
      //   throw new Error(__('The last name should only contain alphabetical and numeric characters'))
      // }
      break;
    case 'username' :
      if (typeof value === 'undefined' || value === '') {
        throw new Error(__('The username cannot be empty'));
      }
      if (!Validator.isEmail(value)) {
        throw new Error(__('The username should be a valid email address'))
      }
      break;
    case 'id' :
      if (typeof value === 'undefined' || value === '') {
        throw new Error(__('The user id cannot be empty'));
      }
      if (!Validator.isUUID(value)) {
        throw new Error(__('The user id should be a valid UUID'))
      }
      break;
    default :
      throw new Error(__('No validation defined for field: ' + field));
      break;
  }
  return true;
};

/**
 * Validate a user
 *
 * @param user {object} The user to validate
 * @param fields {array} The names of the fields to validate
 * @returns {object} The user in case of success
 * @throw Error if the user is not valid
 */
User.prototype.validate = function (user, fields) {
  if (fields == undefined) {
    fields = ['id', 'username', 'firstname', 'lastname'];
  }

  var errors = [];
  for (var i in fields) {
    var fieldName = fields[i];
    try {
      this.__validate(fieldName, user[fieldName]);
    } catch (e) {
      var fieldError = {};
      fieldError[fieldName] = e.message;
      errors.push(fieldError);
    }
  }

  if (errors.length > 0) {
    // Return exception with details in validationErrors.
    var e = new Error(__('user could not be validated'));
    // Add validation errors to the error object.
    e.validationErrors = errors;
    throw e;
  }

  return user;
};

/**
 * Set a firstname and last name for the plugin user
 *
 * @param firstname {string} The user first name
 * @param lastname {string} The user last name
 * @return {bool}
 * @throw Error if the firsname or the lastname are not valid
 */
User.prototype.setName = function (firstname, lastname) {
  this.__validate('firstname', firstname);
  this.__validate('lastname', lastname);
  this._user.lastname = lastname;
  this._user.firstname = firstname;
  return (Config.write('user.firstname', firstname)
  && Config.write('user.lastname', lastname));
};

/**
 * Set a username for the plugin user
 *
 * @param username {string} The user username
 * @return {bool}
 * @throw Error if the username is not valid
 */
User.prototype.setUsername = function (username) {
  this.__validate('username', username);
  this._user.username = username;
  return (Config.write('user.username', username));
};

/**
 * Set the user id
 *
 * @param id {string} The user id
 * @return {bool}
 * @throw Error if the user id is not valid
 */
User.prototype.setId = function (id) {
  this.__validate('id', id);
  this._user.id = id;
  return (Config.write('user.id', id));
};

/**
 * Set the user
 *
 * @param user {object} The user to set
 * @return {object} The user
 * @throw Error if the user information are not valid
 */
User.prototype.set = function (user) {
  if (typeof user === 'undefined') {
    throw new Error(__('The user cannot be empty'));
  }
  this.setId(user.id);
  this.setUsername(user.username);
  this.setName(user.firstname, user.lastname);

  if (typeof user.settings !== 'undefined') {
    this.settings.set(user.settings);
  }

  return this._user;
};

/**
 * Get the user and validate values before returning them
 *
 * @param fields {array} The fields to retrieve
 *   Example format :
 *   {
 *     user : ['firstname', 'lastname', 'username'],
 *     settings : ['domain', 'securityToken']
 *   }
 *
 *   Not providing this parameter will result in the function
 *   returning all the data known.
 * @return {object}
 * @throw Error if the user or the setting are not valid
 */
User.prototype.get = function (data) {
  try {

    if (data != undefined && data.user != undefined) {
      this._getLocal(data.user);
    }
    else {
      this._getLocal();
    }
    var user = this._user;

    // Get settings according to data provided.
    if (data != undefined && data.user != undefined && data.settings != undefined) {
      user.settings = this.settings.get(data.settings);
    }
    // If no data is provided, get everything.
    else if (data == undefined) {
      user.settings = this.settings.get();
    }

    return user;

  } catch (e) {
    throw new Error(__('The user is not set'));
  }
};

/**
 * Get the user name
 *
 * @return {object}
 * format :
 *   {
 *     firstname : 'FIRST_NAME',
 *     lastname : 'LAST_NAME'
 *   }
 */
User.prototype.getName = function () {
  var name = {
    firstname: Config.read('user.firstname'),
    lastname: Config.read('user.lastname')
  };
  return name;
};

/**
 * Get the username
 *
 * @return {string}
 */
User.prototype.getUsername = function () {
  return Config.read('user.username');
};

/**
 * Get the current user from the local storage.
 * All data returned are validated once again.
 *
 * @param fields {array} The fields names to retrieve.
 * @return {object}
 * @throw Exception in case a data doesn't validate before being returned
 */
User.prototype._getLocal = function (fields) {
  // Default data to return for user.
  var userDefaultFields = [
    "id",
    "username",
    "firstname",
    "lastname"
  ];

  // If data is not provided as a parameter, we use default data.
  if (fields == undefined) {
    fields = userDefaultFields;
  }

  // For each user data requested, try to retrieve it and validate it.
  for (var i in fields) {
    var varName = fields[i];
    this._user[varName] = Config.read('user.' + varName);

    try {
      this.__validate(varName, this._user[varName]);
    } catch (e) {
      this._user[varName] = {};
      throw new Error(__('The user is not set'));
    }
  }

  return this._user;
};

/**
 * Get the user logged-in on the server
 *
 * @returns {Promise}
 */
User.prototype._getRemote = function () {
  var self = this,
    url;

  return new Promise(function(resolve, reject) {
    //Check if there is a trusted domain
    try {
      url = self.settings.getDomain() + self.URL_GET_REMOTE;
    } catch (e) {
      reject(__('The application domain is not set'));
      return;
    }

    // Try to get the current user from memory cache
    if (typeof self._remote_user !== 'undefined') {
      resolve(self._remote_user);
      return;
    }

    // If it's not done already, get it from remote server
    fetch(
      url, {
        method: 'GET',
        credentials: 'include',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        }
      })
      .then(function (response) {
        var json = response.json();
        // Check response status
        if (!response.ok) {
          var msg = __('Could not get the current user information. The server responded with an error.');
          if (json.headers.msg != undefined) {
            msg += ' ' + json.headers.msg;
          }
          msg += ' (' + response.status + ')';
          return reject(new Error(msg));
        } else {
          // Save temporarily and return remote version of current user
          self._remote_user = json.body;
          resolve(json.body);
        }
      })
      .catch(function (error) {
        reject(error);
      });
  });
};

/**
 * Check if the current user and its settings are valid
 *
 * @returns {boolean}
 */
User.prototype.isValid = function () {
  // @TODO check if local and remote matches
  try {
    this.get();
  } catch (e) {
    return false;
  }
  return this.settings.isValid();
};

/**
 * Check if the current user is logged-in
 *
 * @returns {Promise}
 */
User.prototype.isLoggedIn = function () {
  var _this = this;

  return new Promise(function(resolve, reject) {
    fetch(
      _this.settings.getDomain() + '/auth/checkSession.json', {
        method: 'GET',
        credentials: 'include',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        }
      })
      .then(function (response) {
        // Check response status
        if (!response.ok) {
          reject(new Error(__('The user is not logged-in')));
        } else {
          resolve(__('The user is logged-in'));
        }
      })
      .catch(function (error) {
        reject(error);
      });
  });
};

/**
 * Store master password temporarily.
 *
 * @param masterPassword {string} The master password to store.
 */
User.prototype.storeMasterPasswordTemporarily = function (masterPassword) {
  _masterPassword = {
    "password": masterPassword,
    "created": Math.round(new Date().getTime() / 1000.0)
  };
  var timeout = 5 * 60; // 5 minutes.
  this._loopDeleteMasterPasswordOnTimeout(timeout);
};

/**
 * Loop to be executed every second to check if the master password should be deleted.
 *
 * @param timeout {int} timeout in seconds (example, if password should be
 *  deleted after 5 minutes, 5*60)
 * @private
 */
User.prototype._loopDeleteMasterPasswordOnTimeout = function (timeout) {
  var self = this;
  var currentTimestamp = Math.round(new Date().getTime() / 1000.0);
  if (currentTimestamp >= _masterPassword.created + timeout) {
    _masterPassword = null;
  }
  else {
    setTimeout(function () {
      self._loopDeleteMasterPasswordOnTimeout(timeout);
    }, 1000);
  }
};

/**
 * Retrieve master password from memory, in case it was stored temporarily
 * by the user.
 * @returns {Promise}
 */
User.prototype.getStoredMasterPassword = function () {
  return new Promise (function(resolve, reject) {
    if (_masterPassword !== null) {
      resolve(_masterPassword.password);
    } else {
      reject();
    }
  });
};

/**
 * Search users by keywords
 *
 * @param keywords
 * @param excludedUsers
 * @return {Promise}
 */
User.prototype.searchUsers = function(keywords, excludedUsers) {
  var _this = this;

  return new Promise (function(resolve, reject) {
    var _response = null;
    fetch(
      _this.settings.getDomain() + '/users.json?filter[keywords]=' + htmlspecialchars(keywords, 'ENT_QUOTES') + '&filter[is-active]=1', {
        method: 'GET',
        credentials: 'include',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        }
      })
      .then(function (response) {
        _response = response;
        return response.json();
      })
      .then(function (json) {
        // Check response status
        if (!_response.ok) {
          var msg = __('Could not get the users. The server responded with an error.');
          if (json.headers.msg != undefined) {
            msg += ' ' + json.headers.msg;
          }
          msg += ' (' + _response.status + ')';
          reject(new Error(msg));
          return;
        }

        var users = json.body;
        var finalUsers = [];
        for (var i in users) {
          if (!in_array(users[i].User.id, excludedUsers)) {
            finalUsers.push(users[i]);
          }
        }
        resolve(finalUsers);
      })
      .catch(function (error) {
        reject(error);
      });
  });
};

// Exports the User object.
exports.User = User;
