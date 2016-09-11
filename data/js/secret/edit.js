/**
 * Edit a secret.
 *
 * @copyright (c) 2015-present Bolt Softwares Pvt Ltd
 * @licence GNU Affero General Public License http://www.gnu.org/licenses/agpl-3.0.en.html
 */

(function () {

  // The dialog can be open in create or in edit mode.
  // In edit mode the secret needs to be decrypted to be edited.
  var dialogCase = 'create',
    originalSecret = '',
    initialSecretPlaceholder = null,
  // The password to edit, it is retrieved by sending a request to the addon-code.
    editedPassword = null,
  // When the validation has already been called once
    validationCalled = false,
  // DOM Elements.
    $secret = null,
    $secretClear = null,
    $viewSecretButton = null,
    $secretStrength = null,
    $generateSecretButton = null,
    $feedback = null;

  /**
   * Initialize the secret add/edit component.
   */
  var init = function () {
    // Is the dialog opened to edit a password, or to add a new one.
    dialogCase = window.location.href.indexOf('case=edit') != -1 ? 'edit' : 'create';

    // Load the page template.
    loadTemplate()
    // Init the secret strength with an empty password.
      .then(updateSecretStrength)
      // Init the security token.
      .then(function () {
        return passbolt.security.initSecurityToken('#js_secret', '.security-token');
      })
      // Retrieve the currently edited secret model (even in add case)
      .then(getEditedPassword)
      // Lock the secret filed if in edition mode.
      .then(function () {
        if (dialogCase == 'edit') {
          // Mark it as encrypted here.
          secretStateChangeHandler('encrypted');
        }
      })
      // Init the event listeners.
      .then(initEventsListeners, error);
  };

  /**
   * Error handler.
   * @param error
   */
  var error = function (error) {
    throw error;
  };

  /**
   * Load the page template and initialize the variables relative to it.
   * @returns {*|Promise.<T>|*}
   */
  var loadTemplate = function () {
    return passbolt.helper.html.loadTemplate('body', './tpl/secret/edit.ejs')
      .then(function () {
        $secret = $('#js_secret');
        $secretClear = $('#js_secret_clear');
        $viewSecretButton = $('#js_secret_view');
        $secretStrength = $('#js_secret_strength');
        $generateSecretButton = $('#js_secret_generate');
        $feedback = $('#js_field_password_feedback');
        initialSecretPlaceholder = $secret.attr('placeholder');
      });
  };

  /**
   * Get the currently edited secret.
   * It must have been stored before launching the secret add/edit dialog.
   * @returns {Promise.<T>|*}
   */
  var getEditedPassword = function () {
    return passbolt.request('passbolt.edit-password.get-edited-password')
      .then(function (data) {
        // Store the secret to edit.
        editedPassword = data;
      });
  };

  /**
   * Init the events listeners.
   * The events can come from the following sources : addon, page or DOM.
   */
  var initEventsListeners = function () {
    $secret.on('input change', secretFieldUpdatedHandler);
    $secret.on('keydown', secretFieldKeydownHandler);
    $secretClear.on('input', secretClearFieldUpdatedHandler);
    $secret.on('focus', secretFieldFocusedHandler);
    $generateSecretButton.on('click', generateSecretButtonClickedHandler);
    $viewSecretButton.on('click', viewSecretButtonClickedHandler);
    passbolt.message.on('passbolt.secret-edit.validate-success', validateSuccessHandler);
    passbolt.message.on('passbolt.secret-edit.validate-error', validateErrorHandler);
    passbolt.message.on('passbolt.secret.focus', onSecretFocusHandler);
  };

  /**
   * Is the secret decrypted?
   * @returns {boolean}
   */
  var isDecrypted = function () {
    return editedPassword.secret != null;
  };

  /**
   * Show in clear / obfuscate the secret.
   */
  var toggleViewSecret = function () {
    if ($secret.hasClass('hidden')) {
      $secret.removeClass('hidden');
      $secretClear.addClass('hidden');
      $viewSecretButton.removeClass('selected');
    } else {
      $secret.addClass('hidden');
      $secretClear.removeClass('hidden');
      $secretClear.val($secret.val());
      $viewSecretButton.addClass('selected');
    }
  };

  /**
   * Update the secret strength component.
   * @param secret
   */
  var updateSecretStrength = function (secret) {
    if (secret === undefined) {
      secret = '';
    }

    // Calcul the secret strength.
    var strength = secretComplexity.strength(secret),
    // Data to pass to the template.
      tplData = {
        strengthId: secretComplexity.STRENGTH[strength].id,
        strengthLabel: secretComplexity.STRENGTH[strength].label
      };

    return passbolt.helper.html.loadTemplate($secretStrength, './tpl/secret/strength.ejs', 'html', tplData)
      .then(function () {
        // Add class on the top container.
        var containerClasses = $secretStrength.attr('class').split(' ');
        if (containerClasses.length > 1) {
          $secretStrength.removeClass(containerClasses.pop());
        }
        $secretStrength.addClass(secretComplexity.STRENGTH[strength].id);
      }, error);
  };

  /**
   * The secret is still encrypted, decrypt it.
   */
  var decryptSecret = function () {
    // If a decryption is already happening, don't trigger it twice.
    if ($secret.hasClass("decrypting")) {
      return;
    }

    // Add class decrypting to show something is happening.
    $secret.addClass("decrypting");
    // Change placeholder text.
    $secret.attr("placeholder", "decrypting...");

    // Request the secret decryption.
    return passbolt.request('passbolt.secret.decrypt', editedPassword.armored)

      // Store the secret locally, and mark change the component state.
      .then(function (secret) {
        originalSecret = secret;
        editedPassword.secret = secret;
        secretStateChangeHandler('decrypted');
      }, error)

      // Store the decrypted password in the model.
      // It will be useful to other workers (here app when the user will save
      // the password changes).
      .then(function () {
        return passbolt.request('passbolt.edit-password.set-edited-password', editedPassword);
      }, error);
  };

  /* ==================================================================================
   *  Addon events handlers
   * ================================================================================== */

  /**
   * When the addon-code orders the secret field to be focused.
   */
  var onSecretFocusHandler = function () {
    $secret.focus();
  };

  /* ==================================================================================
   *  DOM events handlers
   * ================================================================================== */

  // When the user explicitly wants to view the secret.
  var viewSecretButtonClickedHandler = function (ev) {
    ev.preventDefault();
    // The operation requires the secret to be decrypted.
    if (isDecrypted()) {
      toggleViewSecret();
    } else {
      decryptSecret()
        .then(function () {
          toggleViewSecret();
        });
    }
  };

  // When the secret is updated.
  var secretFieldUpdatedHandler = function (ev) {
    // Because change is triggered even if input has been triggered previously
    // (1. user changes the input (input triggered); 2. users moves the focus (change triggered);)
    // Isolate the input binding and trigger change manually to avoid the double change call is useless.
    if ($secret.val() == editedPassword.secret) {
      return;
    }

    // If the secret is encrypted, decrypt it first.
    if (!isDecrypted()) {
      decryptSecret();
      return;
    }

    // Update the interface.
    editedPassword.secret = $secret.val();
    $secretClear.val(editedPassword.secret);
    updateSecretStrength(editedPassword.secret);
    passbolt.request('passbolt.edit-password.set-edited-password', editedPassword);

    // If the secret has been validated once, validate it again.
    // Validate the field.
    if (validationCalled) {
      passbolt.request('passbolt.secret-edit.validate');
    }
  };

  // When a user click on the secret/password field
  var secretFieldFocusedHandler = function (ev) {
    if (!isDecrypted()) {
      // If click is done while on the non decrypted state,
      // we remove the focus.
      // We do that because the focus will be needed by the passphrase dialog.
      $secret.blur();

      // Launch decryption.
      decryptSecret();
    }
  };

  // When the clear secret is updated.
  var secretClearFieldUpdatedHandler = function () {
    $secret.val($secretClear.val())
      .trigger('change');
  };

  // When the generate a new secret button is clicked.
  var generateSecretButtonClickedHandler = function (ev) {
    ev.preventDefault();

    if ($(this).attr('disabled') == 'disabled') {
      return false;
    }

    $secret.val(secretComplexity.generate())
      .trigger('change');
  };

  // When tab is pressed in secret field, inform app, so it can put the focus on the next field.
  var secretFieldKeydownHandler = function (ev) {
    if (!isDecrypted()) {
      ev.preventDefault();
      return false;
    }
    var code = ev.keyCode || ev.which;
    // Backtab key.
    if (code == '9' && ev.shiftKey) {
      $secret.blur();
      passbolt.message.emitOn('App', 'passbolt.event.trigger_to_page', 'secret_backtab_pressed');
    }
    // Tab key.
    else if (code == '9') {
      $secret.blur();
      passbolt.message.emitOn('App', 'passbolt.event.trigger_to_page', 'secret_tab_pressed');
    }
  };

  var validateSuccessHandler = function () {
    $secret.removeClass('error');
    $secretClear.removeClass('error');

    // Hide the error feedback.
    $feedback.hide();

    // Resize the iframe to fit the content.
    passbolt.helper.html.resizeIframe('#passbolt-iframe-secret-edition', {
      width: '100%'
    });

    // Mark as already validated.
    validationCalled = true;
  };

  var validateErrorHandler = function (message, validationErrors) {
    var error = '';

    $secret.addClass('error');
    $secretClear.addClass('error');

    // Display the error feedback.
    for (var i in validationErrors) {
      for (var fieldName in validationErrors[i])
        error += validationErrors[i][fieldName] + ' ';
    }
    $feedback.html(error).show();

    // Resize the iframe to fit the content.
    passbolt.helper.html.resizeIframe('#passbolt-iframe-secret-edition', {
      width: '100%'
    });

    // Mark as already validated.
    validationCalled = true;
  };

  /**
   * The secret state has change. Handle the change, and update the components
   * that are affected by this change.
   *
   * In case of encrypted secret :
   *  - The generate a random secret button should be disabled;
   *  - The secret field should display a placeholder to notify the user about
   *    the secret state;
   *
   * In case of decrypted secret :
   *  - The generate a random secret button should be enabled;
   *  - The secret field should use the default behavior to display the
   *    secret.
   *
   * @param state
   */
  var secretStateChangeHandler = function (state) {
    if (state == 'encrypted') {
      $secret.attr('placeholder', 'click here to unlock')
        .parent().addClass('has-encrypted-secret');

      $generateSecretButton
        .addClass('disabled')
        .attr('disabled', 'disabled');
    }
    else if (state == 'decrypted') {
      $secret
        .val(editedPassword.secret)
        .attr('placeholder', initialSecretPlaceholder)
        .focus()
        .trigger('change')
        .removeClass('decrypting')
        .parent().removeClass('has-encrypted-secret');

      $generateSecretButton
        .removeClass('disabled')
        .removeAttr('disabled');
    }
  };

  // Init the secret add/edit dialog.
  init();

})();