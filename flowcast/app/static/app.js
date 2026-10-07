// Small progressive enhancements. No frameworks, no network calls.
(function () {
  "use strict";
  // Keep the chat log scrolled to the newest message.
  var log = document.getElementById("chatlog");
  if (log) { log.scrollTop = log.scrollHeight; }
  // Confirm destructive form buttons.
  document.querySelectorAll("button.danger").forEach(function (b) {
    b.addEventListener("click", function (e) { if (!window.confirm("Remove this item?")) { e.preventDefault(); } });
  });
  // Hour selector on the People page submits on change.
  var asOf = document.querySelector('select[name="as_of"]');
  if (asOf) { asOf.addEventListener("change", function () { asOf.form.submit(); }); }
})();
