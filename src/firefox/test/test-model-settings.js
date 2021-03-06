/**
 * Test settings model.
 *
 * @copyright (c) 2017 Passbolt SARL
 * @licence GNU Affero General Public License http://www.gnu.org/licenses/agpl-3.0.en.html
 */

'use strict';

var Settings = require('../lib/model/settings').Settings;
var settings = new Settings();
var Validator = require('../lib/vendors/validator.js');

/**
 * Test Gpg Key Import
 * @param assert
 */
exports.testIsValid = function(assert) {
    assert.ok(settings.isValid() === false, 'Settings should not be valid');
};

require('../sdk/test').run(exports);