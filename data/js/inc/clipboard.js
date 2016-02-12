/**
 * The passbolt clipboard module used on content code side.
 *
 * @copyright (c) 2015-present Bolt Softwares Pvt Ltd
 * @licence GNU Affero General Public License http://www.gnu.org/licenses/agpl-3.0.en.html
 */
var passbolt = passbolt || {};

(function (passbolt) {

  // The clipboard module.
  var clipboard = {},
    // The callbacks associated to each request of master done.
    callbacks = {};

  /**
   * Copy a string into the clipboard
   * @param txt
   */
  clipboard.copy = function(txt) {
    self.port.emit("passbolt.clipboard.copy", txt);
  };

  passbolt.clipboard = clipboard;

})( passbolt );
