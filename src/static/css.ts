// The admin stylesheet, served at `<admin>/static/admin.css` with a long cache. Django-admin look,
// light and dark (prefers-color-scheme), responsive.
export const ADMIN_CSS = `
:root {
  --primary: #79aec8; --secondary: #417690; --accent: #f5dd5d; --primary-fg: #fff;
  --body-fg: #333; --body-bg: #fff; --body-quiet-color: #666; --body-medium-color: #444; --body-loud-color: #000;
  --header-color: #ffc; --header-branding-color: var(--accent); --header-bg: var(--secondary); --header-link-color: var(--primary-fg);
  --breadcrumbs-fg: #c4dce8; --breadcrumbs-link-fg: var(--body-bg); --breadcrumbs-bg: #264b5d;
  --link-fg: #417893; --link-hover-color: #036; --link-selected-fg: var(--secondary);
  --hairline-color: #e8e8e8; --border-color: #ccc;
  --error-fg: #ba2121; --message-success-bg: #dfd; --message-warning-bg: #ffc; --message-error-bg: #ffefef; --message-info-bg: #e8f1f8;
  --darkened-bg: #f8f8f8; --selected-bg: #e4e4e4; --selected-row: #ffc;
  --button-fg: #fff; --button-bg: var(--secondary); --button-hover-bg: #205067;
  --default-button-bg: #205067; --default-button-hover-bg: var(--secondary);
  --close-button-bg: #747474; --close-button-hover-bg: #333;
  --delete-button-bg: #ba2121; --delete-button-hover-bg: #a41515;
  --object-tools-fg: var(--button-fg); --object-tools-bg: var(--close-button-bg); --object-tools-hover-bg: var(--close-button-hover-bg);
  --font-family-primary: "Segoe UI", system-ui, Roboto, "Helvetica Neue", Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji";
  --font-family-monospace: ui-monospace, Menlo, Monaco, "Cascadia Mono", "Segoe UI Mono", "Roboto Mono", monospace;
  color-scheme: light;
}
@media (prefers-color-scheme: dark) {
  :root {
    --primary: #264b5d; --primary-fg: #f7f7f7;
    --body-fg: #eee; --body-bg: #121212; --body-quiet-color: #d0d0d0; --body-medium-color: #e0e0e0; --body-loud-color: #fff;
    --breadcrumbs-link-fg: #e0e0e0; --breadcrumbs-bg: var(--primary);
    --link-fg: #81d4fa; --link-hover-color: #4ac1f7; --link-selected-fg: #6f94c6;
    --hairline-color: #272727; --border-color: #353535;
    --error-fg: #e35f5f; --message-success-bg: #006b1b; --message-warning-bg: #583305; --message-error-bg: #570808; --message-info-bg: #123047;
    --darkened-bg: #212121; --selected-bg: #1b1b1b; --selected-row: #00363a;
    --close-button-bg: #333; --close-button-hover-bg: #666;
    color-scheme: dark;
  }
}
* { box-sizing: border-box; }
html, body { height: 100%; }
body { margin: 0; padding: 0; font-size: 0.875rem; font-family: var(--font-family-primary); color: var(--body-fg); background: var(--body-bg); }
a:link, a:visited { color: var(--link-fg); text-decoration: none; transition: color .15s; }
a:focus, a:hover { color: var(--link-hover-color); }
a:focus { text-decoration: underline; }
a img { border: none; }
a.section:link, a.section:visited { color: var(--header-link-color); text-decoration: none; }
p, ol, ul, dl { margin: .2em 0 .8em 0; }
p { padding: 0; line-height: 140%; }
h1, h2, h3, h4, h5 { font-weight: bold; }
h1 { margin: 0 0 20px; font-weight: 300; font-size: 1.25rem; }
h2 { font-size: 1rem; margin: 1em 0 .5em 0; }
h2.subhead { font-weight: normal; margin-top: 0; }
h3 { font-size: .875rem; margin: .8em 0 .3em 0; color: var(--body-medium-color); }
h4 { font-size: .75rem; margin: 1em 0 .8em 0; padding-bottom: 3px; color: var(--body-medium-color); }
ul > li { list-style-type: square; padding: 1px 0; }
li ul { margin-bottom: 0; }
li, dt, dd { font-size: .8125rem; line-height: 1.25rem; }
fieldset { min-width: 0; padding: 0; border: none; border-top: 1px solid var(--hairline-color); }
details summary { cursor: pointer; }
blockquote { font-size: .6875rem; color: #777; margin-left: 2px; padding-left: 10px; border-left: 5px solid #ddd; }
code, pre { font-family: var(--font-family-monospace); color: var(--body-quiet-color); font-size: .75rem; overflow-x: auto; }
hr { clear: both; color: var(--hairline-color); background-color: var(--hairline-color); height: 1px; border: none; margin: 0; padding: 0; line-height: 1px; }
.small { font-size: .6875rem; }
.mini { font-size: .625rem; }
.help, p.help, form p.help, div.help, form div.help, div.help li { font-size: .6875rem; color: var(--body-quiet-color); }
div.help ul { margin-bottom: 0; }
.help-tooltip { cursor: help; }
p img, h1 img, h2 img, h3 img, h4 img, td img { vertical-align: middle; }
.quiet, a.quiet:link, a.quiet:visited { color: var(--body-quiet-color); font-weight: normal; }
.clear { clear: both; }
.nowrap { white-space: nowrap; }
.hidden { display: none !important; }
.visually-hidden { position: absolute; width: 1px; height: 1px; padding: 0; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0; }
.skip-to-content-link { position: absolute; top: -999px; margin: 5px; padding: 5px; background: var(--body-bg); z-index: 1; }
.skip-to-content-link:focus { left: 0; top: 0; }

/* tables */
table { border-collapse: collapse; border-color: var(--border-color); }
td, th { font-size: .8125rem; line-height: 1rem; border-bottom: 1px solid var(--hairline-color); vertical-align: top; padding: 8px; }
th { font-weight: 600; text-align: left; }
thead th, tfoot td { color: var(--body-quiet-color); padding: 5px 10px; font-size: .6875rem; background: var(--body-bg); border: none; border-top: 1px solid var(--hairline-color); border-bottom: 1px solid var(--hairline-color); }
thead th.required { color: var(--body-loud-color); }
tr.row-label td { font-size: .5625rem; padding-top: 2px; padding-bottom: 0; border-bottom: none; color: var(--body-quiet-color); margin-top: -1px; }
tr:nth-child(odd), .row-form-errors { background: var(--body-bg); }
tr:nth-child(even), tr:nth-child(even) .errorlist, tr:nth-child(odd) + .row-form-errors, tr:nth-child(odd) + .row-form-errors .errorlist { background: var(--darkened-bg); }

/* sortable table headers */
thead th { padding: 5px 10px; line-height: normal; text-transform: uppercase; background: var(--darkened-bg); }
thead th a:link, thead th a:visited { color: var(--body-quiet-color); }
thead th.sorted { background: var(--selected-bg); }
thead th.sorted .text { padding-right: 42px; }
table thead th .text span { padding: 8px 10px; display: block; }
table thead th .text a { display: block; cursor: pointer; padding: 8px 10px; }
table thead th .text a:focus, table thead th .text a:hover { background: var(--selected-bg); }
thead th.sorted a.sortremove { visibility: hidden; }
table thead th.sorted:hover a.sortremove { visibility: visible; }
table thead th.sorted .sortoptions { display: block; padding: 9px 5px 0 5px; float: right; text-align: right; }
table thead th.sorted .sortpriority { font-size: .8em; min-width: 12px; text-align: center; vertical-align: 3px; margin-left: 2px; margin-right: 2px; }
table thead th.sorted .sortoptions a { position: relative; width: 14px; height: 14px; display: inline-block; text-align: center; font-size: 11px; line-height: 14px; }
table thead th.sorted .sortoptions a.sortremove::before { content: "\\00d7"; }
table thead th.sorted .sortoptions a.ascending::before { content: "\\25b2"; }
table thead th.sorted .sortoptions a.descending::before { content: "\\25bc"; }

/* forms */
form .required, label.required { font-weight: bold; }
input, textarea, select, .form-row p, form .button { margin: 2px 0; padding: 2px 3px; vertical-align: middle; font-family: var(--font-family-primary); font-weight: normal; font-size: .8125rem; }
.form-row div.help { padding: 2px 3px; }
textarea { vertical-align: top; }
input[type=text], input[type=password], input[type=email], input[type=url], input[type=number], input[type=tel], input[type=search], input[type=date], input[type=datetime-local], input[type=time], textarea, select, .vTextField {
  border: 1px solid var(--border-color); border-radius: 4px; padding: 5px 6px; margin-top: 0; color: var(--body-fg); background-color: var(--body-bg);
}
input[type=text]:focus, input[type=password]:focus, input[type=email]:focus, input[type=url]:focus, input[type=number]:focus, input[type=search]:focus, input[type=date]:focus, input[type=datetime-local]:focus, input[type=time]:focus, textarea:focus, select:focus { border-color: var(--body-quiet-color); outline: 2px solid var(--primary); outline-offset: 0; }
select { height: 1.875rem; }
select[multiple] { height: auto; min-height: 150px; }
.button, input[type=submit], input[type=button], .submit-row input, a.button, button.button {
  background: var(--button-bg); padding: 10px 15px; border: none; border-radius: 4px; color: var(--button-fg); cursor: pointer; transition: background .15s; font-size: .8125rem; display: inline-block; line-height: 1.1;
}
a.button { padding: 4px 5px; }
.button:active, input[type=submit]:active, input[type=button]:active, .button:focus, input[type=submit]:focus, input[type=button]:focus, .button:hover, input[type=submit]:hover, input[type=button]:hover { background: var(--button-hover-bg); }
.button[disabled], input[type=submit][disabled], input[type=button][disabled] { opacity: .4; }
.button.default, input[type=submit].default, .submit-row input.default { border: none; font-weight: 400; background: var(--default-button-bg); }
.button.default:active, input[type=submit].default:active, .button.default:focus, input[type=submit].default:focus, .button.default:hover, input[type=submit].default:hover { background: var(--default-button-hover-bg); }
.vTextField, .vURLField { width: 20em; }
.vLargeTextField, .vXMLLargeTextField, textarea { width: 48em; max-width: 100%; }
.vIntegerField, .vBigIntegerField, .vForeignKeyRawIdAdminField, .vManyToManyRawIdAdminField { width: 10em; }
.vForeignKeyRawIdAdminField, .vManyToManyRawIdAdminField { width: 16em; }
.vJSONField { font-family: var(--font-family-monospace); }
.inline-group .vTextField, .inline-group textarea { width: auto; min-width: 10em; }
.inline-group .tabular textarea { height: 5em; }

/* messages & errors */
ul.messagelist { padding: 0; margin: 0; }
ul.messagelist li { display: block; font-weight: 400; font-size: .8125rem; padding: 10px 10px 10px 65px; margin: 0 0 10px 0; background: var(--message-success-bg); color: var(--body-fg); word-break: break-word; position: relative; }
ul.messagelist li::before { position: absolute; left: 30px; font-weight: bold; }
ul.messagelist li.success::before { content: "\\2714"; color: #2e7d32; }
ul.messagelist li.warning { background: var(--message-warning-bg); }
ul.messagelist li.warning::before { content: "!"; color: #b98c00; }
ul.messagelist li.error { background: var(--message-error-bg); }
ul.messagelist li.error::before { content: "\\2716"; color: var(--error-fg); }
ul.messagelist li.info, ul.messagelist li.debug { background: var(--message-info-bg); }
ul.messagelist li.info::before { content: "i"; }
.errornote { font-size: .875rem; font-weight: 700; display: block; padding: 10px 12px; margin: 0 0 10px 0; color: var(--error-fg); border: 1px solid var(--error-fg); border-radius: 4px; background-color: var(--body-bg); }
ul.errorlist { margin: 0 0 4px; padding: 0; color: var(--error-fg); background: var(--body-bg); }
ul.errorlist li { font-size: .8125rem; display: block; margin-bottom: 4px; overflow-wrap: break-word; }
ul.errorlist li:first-child { margin-top: 0; }
ul.errorlist li a { color: inherit; text-decoration: underline; }
td ul.errorlist { margin: 0; padding: 0; }
td ul.errorlist li { margin: 0; }
.form-row.errors { margin: 0; border: none; border-bottom: 1px solid var(--hairline-color); background: none; }
.form-row.errors ul.errorlist li { padding-left: 0; }
.errors input, .errors select, .errors textarea, td ul.errorlist + input, td ul.errorlist + select, td ul.errorlist + textarea { border: 1px solid var(--error-fg); }
.description { font-size: .75rem; padding: 5px 0 0 12px; }

/* layout */
#container { position: relative; width: 100%; min-width: 980px; padding: 0; display: flex; flex-direction: column; height: 100%; }
#container > .main { display: flex; flex: 1 0 auto; }
.main > .content { order: 3; flex: 1 0; max-width: 100%; min-width: 0; }
.skip-to-content-link:focus { left: 0; }
#content { padding: 20px 40px; }
.dashboard #content { width: 600px; }
#content-main { float: left; width: 100%; }
#content-related { float: right; width: 260px; position: relative; margin-right: -300px; }
.colMS { margin-right: 300px; }
.colSM { margin-left: 300px; }
#footer { clear: both; padding: 10px; }

/* header */
#header { width: auto; height: auto; display: flex; justify-content: space-between; align-items: center; padding: 10px 40px; background: var(--header-bg); color: var(--header-color); overflow: hidden; }
#header a:link, #header a:visited, #logout-form button { color: var(--header-link-color); }
#header a:focus, #header a:hover { text-decoration: underline; }
#branding { display: flex; }
#site-name { padding: 0; margin: 0; margin-inline-end: 20px; font-weight: 300; font-size: 1.5rem; color: var(--header-branding-color); }
#site-name a:link, #site-name a:visited { color: var(--accent); }
#branding h2 { padding: 0 10px; font-size: .875rem; margin: -8px 0 8px 0; font-weight: normal; color: var(--header-color); }
#branding a:hover { text-decoration: none; }
#logout-form { display: inline; }
#logout-form button { background: none; border: 0; cursor: pointer; font-family: var(--font-family-primary); }
#user-tools { float: right; margin: 0 0 0 20px; text-align: right; }
#user-tools, #logout-form button { padding: 0; font-weight: 300; font-size: .6875rem; letter-spacing: .5px; text-transform: uppercase; }
#user-tools a, #logout-form button { border-bottom: 1px solid rgba(255,255,255,.25); }
#user-tools a:focus, #user-tools a:hover, #logout-form button:active, #logout-form button:hover { text-decoration: none; border-bottom: 0; }
#logout-form button:active, #logout-form button:hover { margin-bottom: 1px; }

/* breadcrumbs */
div.breadcrumbs, nav.breadcrumbs { background: var(--breadcrumbs-bg); padding: 10px 40px; border: none; color: var(--breadcrumbs-fg); text-align: left; }
div.breadcrumbs a, nav.breadcrumbs a { color: var(--breadcrumbs-link-fg); }
div.breadcrumbs a:focus, div.breadcrumbs a:hover, nav.breadcrumbs a:focus, nav.breadcrumbs a:hover { color: var(--breadcrumbs-fg); }

/* modules */
.module { border: none; margin-bottom: 30px; background: var(--body-bg); }
.module p, .module ul, .module h3, .module h4, .module dl, .module pre { padding-left: 10px; padding-right: 10px; }
.module blockquote { margin-left: 12px; }
.module ul, .module ol { margin-left: 1.5em; }
.module h3 { margin-top: .6em; }
.module h2, .module caption, .inline-group h2 { margin: 0; padding: 8px; font-weight: 400; font-size: .8125rem; text-align: left; background: var(--header-bg); color: var(--header-link-color); }
.module caption, .inline-group h2 { font-size: .75rem; letter-spacing: .5px; text-transform: uppercase; }
.module table { border-collapse: collapse; }
.module table caption a:link, .module table caption a:visited { color: var(--header-link-color); }
.module > h2 + * { margin-top: 0; }
fieldset.module > h2, details > summary.fieldset-heading { margin: 0; padding: 8px; font-weight: 400; font-size: .8125rem; background: var(--header-bg); color: var(--header-link-color); text-transform: uppercase; letter-spacing: .5px; }
details.collapse > summary.fieldset-heading { list-style-position: inside; }
.dashboard .module table th { width: 100%; }
.dashboard .module table td { white-space: nowrap; }
.dashboard .module table td a { display: block; padding-right: .6em; }
.dashboard table { width: 100%; }
.dashboard #content { width: 100%; max-width: 1000px; }
.app-list .current-app caption, .current-model th { background: var(--selected-row); }

/* object tools */
.object-tools { font-size: .625rem; font-weight: bold; padding-left: 0; float: right; position: relative; margin-top: -48px; }
.object-tools li { display: block; float: left; margin-left: 5px; height: 1rem; list-style: none; }
.object-tools a { border-radius: 15px; }
.object-tools a:link, .object-tools a:visited { display: block; float: left; padding: 3px 12px; background: var(--object-tools-bg); color: var(--object-tools-fg); font-weight: 400; font-size: .6875rem; text-transform: uppercase; letter-spacing: .5px; }
.object-tools a:focus, .object-tools a:hover { background-color: var(--object-tools-hover-bg); }
.object-tools a.addlink::after { content: " +"; }
.object-tools a.viewsitelink::after { content: " \\2197"; }

/* links with icons */
a.addlink::before { content: "+ "; font-weight: bold; }
a.changelink::before, a.inlinechangelink::before { content: "\\270e "; }
a.viewlink::before { content: "\\1f441 "; }
a.deletelink:link, a.deletelink:visited, .deletelink { color: var(--error-fg); }
ul.actionlist li { list-style-type: none; overflow: hidden; text-overflow: ellipsis; }
ul.actionlist li.addlink::before, ul.actionlist li.changelink::before, ul.actionlist li.deletelink::before { font-weight: bold; margin-right: 4px; }
ul.actionlist li.addlink::before { content: "+"; color: #3a3; }
ul.actionlist li.changelink::before { content: "\\270e"; color: #b98c00; }
ul.actionlist li.deletelink::before { content: "\\2716"; color: var(--error-fg); }
.icon-yes { color: #2e7d32; } .icon-no { color: var(--error-fg); } .icon-unknown { color: var(--body-quiet-color); }

/* change list */
#changelist { display: flex; align-items: flex-start; justify-content: space-between; }
#changelist .changelist-form-container { flex: 1 1 auto; min-width: 0; }
#changelist table { width: 100%; }
.change-list .hiddenfields { display: none; }
.change-list .filtered table { border-right: none; }
.change-list .filtered { min-height: 400px; }
.change-list .filtered .results, .change-list .filtered .paginator, .filtered #toolbar, .filtered div.xfull { width: auto; }
.change-list .filtered table tbody th { padding-right: 1em; }
#changelist-form .results { overflow-x: auto; width: 100%; }
#changelist .toplinks { border-bottom: 1px solid var(--hairline-color); }
#changelist .paginator { color: var(--body-quiet-color); border-bottom: 1px solid var(--hairline-color); background: var(--body-bg); overflow: hidden; }
#changelist table thead th.action-checkbox-column { width: 1.5em; text-align: center; }
#changelist table tbody td.action-checkbox { text-align: center; }
#changelist table tfoot { color: var(--body-quiet-color); }
#changelist tbody tr.selected { background-color: var(--selected-row); }
#toolbar { padding: 8px 10px; margin-bottom: 15px; border-top: 1px solid var(--hairline-color); border-bottom: 1px solid var(--hairline-color); background: var(--darkened-bg); color: var(--body-quiet-color); }
#toolbar form input { border-radius: 4px; font-size: .875rem; padding: 5px; color: var(--body-fg); }
#toolbar #searchbar { height: 1.5rem; border: 1px solid var(--border-color); padding: 2px 5px; margin: 0; vertical-align: top; font-size: .8125rem; max-width: 100%; }
#toolbar #searchbar:focus { border-color: var(--body-quiet-color); }
#toolbar form input[type=submit] { border: 1px solid var(--border-color); font-size: .8125rem; padding: 4px 8px; margin: 0; vertical-align: middle; background: var(--body-bg); box-shadow: 0 -15px 20px -10px rgba(0,0,0,.15) inset; cursor: pointer; color: var(--body-fg); }
#toolbar form input[type=submit]:focus, #toolbar form input[type=submit]:hover { border-color: var(--body-quiet-color); }
#changelist-search .help { word-break: break-word; }
#changelist-filter { flex: 0 0 240px; order: 1; background: var(--darkened-bg); border-left: none; margin: 0 0 0 30px; }
#changelist-filter h2 { font-size: .875rem; text-transform: uppercase; letter-spacing: .5px; padding: 5px 15px; margin-bottom: 12px; border-bottom: none; }
#changelist-filter h3, #changelist-filter details summary { font-weight: 400; padding: 0 15px; margin-bottom: 10px; }
#changelist-filter details summary > * { display: inline; }
#changelist-filter details > summary { list-style-type: none; }
#changelist-filter details > summary::-webkit-details-marker { display: none; }
#changelist-filter details > summary::before { content: "\\2192"; font-weight: bold; color: var(--link-hover-color); }
#changelist-filter details[open] > summary::before { content: "\\2193"; }
#changelist-filter ul { padding-left: 0; margin-left: 10px; }
#changelist-filter li { list-style-type: none; margin-left: 0; padding-left: 0; }
#changelist-filter a { display: block; color: var(--body-quiet-color); word-break: break-word; }
#changelist-filter li.selected { border-left: 5px solid var(--hairline-color); padding-left: 10px; margin-left: -15px; }
#changelist-filter li.selected a { color: var(--link-selected-fg); }
#changelist-filter a:focus, #changelist-filter a:hover, #changelist-filter li.selected a:focus, #changelist-filter li.selected a:hover { color: var(--link-hover-color); }
#changelist-filter #changelist-filter-clear a { font-size: .8125rem; padding-bottom: 10px; border-bottom: 1px solid var(--hairline-color); }
.change-list ul.toplinks { display: flex; flex-wrap: wrap; gap: 3px 17px; font-weight: bold; padding: 10px; margin: 0 0 15px; }
.change-list ul.toplinks li { list-style-type: none; }
.change-list ul.toplinks .date-back { color: var(--body-quiet-color); }
.change-list ul.toplinks .date-back::before { content: "\\2039 "; }
.paginator { display: flex; align-items: center; gap: 4px; font-size: .8125rem; padding-top: 10px; padding-bottom: 10px; line-height: 22px; margin: 0; border-top: 1px solid var(--hairline-color); width: 100%; }
.paginator a:link, .paginator a:visited { padding: 2px 6px; background: var(--button-bg); text-decoration: none; color: var(--button-fg); }
.paginator a.showall { border: none; background: none; color: var(--link-fg); }
.paginator a.showall:focus, .paginator a.showall:hover { background: none; color: var(--link-hover-color); }
.paginator .end { margin-right: 6px; }
.paginator .this-page { padding: 2px 6px; font-weight: bold; font-size: .8125rem; vertical-align: top; }
.paginator a:focus, .paginator a:hover { color: white; background: var(--link-hover-color); }
.paginator input { margin-left: auto; }
#changelist .actions { padding: 10px; background: var(--body-bg); border-top: none; border-bottom: none; line-height: 1.5rem; color: var(--body-quiet-color); width: 100%; }
#changelist .actions span.all, #changelist .actions span.action-counter, #changelist .actions span.clear, #changelist .actions span.question { font-size: .8125rem; margin: 0 .5em; }
#changelist .actions:last-child { border-bottom: none; }
#changelist .actions select { vertical-align: top; height: 1.5rem; color: var(--body-fg); border: 1px solid var(--border-color); border-radius: 4px; font-size: .875rem; padding: 0 0 0 4px; margin: 0; margin-left: 10px; }
#changelist .actions .button { font-size: .8125rem; border: 1px solid var(--border-color); border-radius: 4px; background: var(--body-bg); box-shadow: 0 -15px 20px -10px rgba(0,0,0,.15) inset; cursor: pointer; height: 1.5rem; line-height: 1; padding: 4px 8px; margin: 0; color: var(--body-fg); }
#changelist-form .results td, #changelist-form .results th { white-space: nowrap; }
#changelist-form .results td.field-description, #changelist-form .results td.field-body { white-space: normal; }

/* change form */
form .form-row p { padding-left: 0; }
.form-row { overflow: hidden; padding: 10px; font-size: .8125rem; border-bottom: 1px solid var(--hairline-color); }
.form-row img, .form-row input { vertical-align: middle; }
.form-row label input[type=checkbox] { margin-top: 0; vertical-align: 0; }
form .form-row p { padding-left: 0; }
.flex-container { display: flex; }
.form-multiline { flex-wrap: wrap; }
.form-multiline > div { padding-bottom: 10px; }
form ul.inline { margin-left: 0; padding: 0; }
form ul.inline li { float: left; padding-right: 7px; list-style: none; }
.aligned label { display: block; padding: 4px 10px 0 0; min-width: 160px; width: 160px; word-wrap: break-word; }
.aligned label:not(.vCheckboxLabel)::after { content: ""; display: inline-block; vertical-align: middle; }
.aligned label + p, .aligned .checkbox-row + div.help, .aligned label + div.readonly { padding: 6px 0; margin-top: 0; margin-bottom: 0; margin-left: 0; overflow-wrap: break-word; }
.aligned ul label { display: inline; float: none; width: auto; }
.aligned .form-row input { margin-bottom: 0; }
.colMS .aligned .vLargeTextField, .colMS .aligned .vXMLLargeTextField { width: 350px; }
form .aligned ul { margin-left: 160px; padding-left: 10px; }
form .aligned div.radiolist { display: inline-block; margin: 0; padding: 0; }
form .aligned div.radiolist.inline li, form ul.inline li { float: left; padding-right: 7px; list-style: none; }
form .aligned p.help, form .aligned div.help { margin-top: 0; margin-left: 160px; padding-left: 10px; }
form .aligned p.date div.help.timezonewarning, form .aligned p.datetime div.help.timezonewarning, form .aligned p.time div.help.timezonewarning { margin-left: 0; padding-left: 0; font-weight: normal; }
form .aligned p.help:last-child, form .aligned div.help:last-child { margin-bottom: 0; padding-bottom: 0; }
form .aligned input + p.help, form .aligned textarea + p.help, form .aligned select + p.help, form .aligned input + div.help, form .aligned textarea + div.help, form .aligned select + div.help { margin-left: 160px; padding-left: 10px; }
form .aligned ul li { list-style: none; }
form .aligned table p { margin-left: 0; padding-left: 0; }
.aligned .vCheckboxLabel { float: none; width: auto; display: inline-block; vertical-align: -3px; padding: 0 0 5px 5px; }
.aligned .vCheckboxLabel + p.help, .aligned .vCheckboxLabel + div.help { margin-top: -4px; }
.colM .aligned .vLargeTextField, .colM .aligned .vXMLLargeTextField { width: 610px; }
fieldset .fieldBox { margin-right: 20px; }
.wide label { width: 200px; min-width: 200px; }
form .wide p.help, form .wide div.help { padding-left: 50px; }
form div.help ul { padding-left: 0; margin-left: 0; }
.submit-row { padding: 12px 14px 12px; margin: 0 0 20px; background: var(--darkened-bg); border: 1px solid var(--hairline-color); border-radius: 4px; overflow: hidden; display: flex; gap: 10px; flex-wrap: wrap; }
body.popup .submit-row { overflow: auto; }
.submit-row input { height: 2.1875rem; line-height: .9375rem; }
.submit-row input, .submit-row a { margin: 0; }
.submit-row input.default { text-transform: uppercase; }
.submit-row a.deletelink { margin-left: auto; }
.submit-row a.deletelink { display: block; background: var(--delete-button-bg); border-radius: 4px; padding: .625rem .9375rem; height: .9375rem; line-height: .9375rem; color: var(--button-fg); }
.submit-row a.closelink { display: inline-block; background: var(--close-button-bg); border-radius: 4px; padding: 10px 15px; height: .9375rem; line-height: .9375rem; color: var(--button-fg); }
.submit-row a.deletelink:focus, .submit-row a.deletelink:hover, .submit-row a.deletelink:active { background: var(--delete-button-hover-bg); text-decoration: none; }
.submit-row a.closelink:focus, .submit-row a.closelink:hover, .submit-row a.closelink:active { background: var(--close-button-hover-bg); text-decoration: none; }
.vSelectMultipleField { vertical-align: top; }
.checkbox-row p.help, .checkbox-row div.help { margin-left: 0; padding-left: 0; }
fieldset .fieldBox { float: left; margin-right: 20px; }
.readonly { word-break: break-word; }
.file-upload { display: inline-block; }
.file-upload a { font-weight: normal; }
.clearable-file-input input { margin-top: 0; }
.related-widget-wrapper { display: flex; gap: 0 10px; flex-wrap: wrap; align-items: flex-start; }
.related-lookup-hint { color: var(--body-quiet-color); font-size: .75rem; }
.selector-filter-input { display: block; width: 100%; margin-bottom: 4px !important; }
.selector { display: inline-flex; flex-direction: column; min-width: 20em; }
.selector.stacked { min-width: 30em; }
.selector select { width: 100%; }
.autocomplete-widget { display: inline-flex; flex-direction: column; gap: 4px; min-width: 20em; }
.autocomplete-widget input[type=search] { width: 100%; }

/* inlines */
.inline-group { padding: 0; margin: 0 0 30px; }
.inline-group thead th { padding: 8px 10px; }
.inline-group .aligned label { width: 160px; }
.inline-related { position: relative; }
.inline-related h3 { margin: 0; color: var(--body-quiet-color); padding: 5px; font-size: .8125rem; background: var(--darkened-bg); border-top: 1px solid var(--hairline-color); border-bottom: 1px solid var(--hairline-color); }
.inline-related h3 span.delete { float: right; }
.inline-related h3 span.delete label { margin-left: 2px; font-size: .6875rem; }
.inline-related fieldset { margin: 0; background: var(--body-bg); border: none; width: 100%; }
.inline-related fieldset.module h3 { margin: 0; padding: 2px 5px 3px 5px; font-size: .6875rem; text-align: left; font-weight: bold; background: #bcd; color: var(--body-bg); }
.inline-group .tabular fieldset.module { border: none; }
.inline-related.tabular fieldset.module table { width: 100%; overflow-x: scroll; }
.last-related fieldset { border: none; }
.inline-group .tabular tr.has_original td { padding-top: 2em; }
.inline-group .tabular tr td.original { padding: 2px 0 0 0; width: 0; _position: relative; }
.inline-group .tabular th.original { width: 0px; padding: 0; }
.inline-group .tabular td.original p { position: absolute; left: 0; height: 1.1em; padding: 2px 9px; overflow: hidden; font-size: .5625rem; font-weight: bold; color: var(--body-quiet-color); _width: 700px; }
.inline-group div.add-row, .inline-group .tabular tr.add-row td { color: var(--body-quiet-color); background: var(--darkened-bg); padding: 8px 10px; border-bottom: 1px solid var(--hairline-color); }
.inline-group .tabular tr.add-row td { padding: 8px 10px; border-bottom: 1px solid var(--hairline-color); }
.inline-group div.add-row a, .inline-group .tabular tr.add-row td a { font-size: .75rem; }
.empty-form { display: none; }
.inline-related .inline-deletelink { float: right; }
td.delete, th.delete { text-align: center; }

/* login */
.login { background: var(--darkened-bg); height: auto; }
.login #header { height: auto; padding: 15px 16px; justify-content: center; }
.login #header h1 { font-size: 1.125rem; margin: 0; }
.login #header h1 a { color: var(--header-link-color); }
.login #content { padding: 20px 20px 0; }
.login #container { background: var(--body-bg); border: 1px solid var(--hairline-color); border-radius: 4px; overflow: hidden; width: 28em; min-width: 300px; margin: 100px auto; height: auto; }
.login .form-row { padding: 4px 0; }
.login .form-row label { display: block; line-height: 2em; }
.login .form-row #id_username, .login .form-row #id_password { padding: 8px; width: 100%; box-sizing: border-box; }
.login .submit-row { padding: 1em 0 0 0; margin: 0; text-align: center; background: none; border: none; justify-content: center; }
.login .password-reset-link { text-align: center; }

/* delete confirmation, history */
#deleted-objects li { font-size: .8125rem; }
#change-history table { width: 100%; }
#change-history table tbody th { width: 16em; }
#change-history .paginator { color: var(--body-quiet-color); border-bottom: 1px solid var(--hairline-color); background: var(--body-bg); overflow: hidden; }
.delete-confirmation form input[type=submit] { background: var(--delete-button-bg); border-radius: 4px; padding: 10px 15px; color: var(--button-fg); }
.delete-confirmation form input[type=submit]:active, .delete-confirmation form input[type=submit]:focus, .delete-confirmation form input[type=submit]:hover { background: var(--delete-button-hover-bg); }
.delete-confirmation form .cancel-link { display: inline-block; vertical-align: middle; height: 2.1875rem; line-height: 2.1875rem; border-radius: 4px; padding: 0 15px; margin: 0 0 0 10px; background: var(--close-button-bg); color: var(--button-fg); }
.delete-confirmation form .cancel-link:active, .delete-confirmation form .cancel-link:focus, .delete-confirmation form .cancel-link:hover { background: var(--close-button-hover-bg); }

/* nav sidebar */
#nav-sidebar { order: 1; flex: 0 0 275px; left: -276px; margin-left: -276px; border-top: 1px solid transparent; border-right: 1px solid var(--hairline-color); background-color: var(--body-bg); overflow: auto; }
.main.shifted > #nav-sidebar { margin-left: 0; }
#nav-sidebar .module th { width: 100%; overflow-wrap: anywhere; }
#nav-sidebar .module th, #nav-sidebar .module caption { padding-left: 16px; }
#nav-sidebar .module td { white-space: nowrap; }
#nav-sidebar .current-model { background: var(--selected-row); }
#toggle-nav-sidebar { order: 2; align-self: stretch; flex: 0 0 23px; width: 23px; border: 0; border-right: 1px solid var(--hairline-color); background-color: var(--body-bg); cursor: pointer; font-size: 1.25rem; color: var(--link-fg); padding: 0; }
#toggle-nav-sidebar::before { content: "\\00bb"; }
.main.shifted #toggle-nav-sidebar::before { content: "\\00ab"; }
#nav-filter { width: 100%; box-sizing: border-box; padding: 2px 5px; margin: 5px 0; border: 1px solid var(--border-color); background-color: var(--darkened-bg); color: var(--body-fg); }

/* responsive */
@media (max-width: 1024px) {
  #container { min-width: 0; }
  #header { flex-direction: column; padding: 15px 30px; justify-content: flex-start; align-items: flex-start; }
  #site-name { margin: 0 0 8px; }
  #user-tools { margin: 0; text-align: left; float: none; }
  div.breadcrumbs, nav.breadcrumbs { padding: 10px 30px; }
  #content { padding: 15px 20px 20px; }
  .colMS { margin-right: 0; }
  #content-related { margin-right: 0; float: none; width: 100%; }
  .object-tools { float: none; margin: 0 0 15px; }
  #changelist { flex-direction: column; }
  #changelist-filter { order: 0; margin: 0 0 20px; flex-basis: auto; }
  .aligned label { width: auto; min-width: 0; }
  form .aligned ul, form .aligned p.help, form .aligned div.help, form .aligned input + div.help, form .aligned select + div.help, form .aligned textarea + div.help { margin-left: 0; padding-left: 0; }
  .flex-container { flex-flow: column; }
  #nav-sidebar, #toggle-nav-sidebar { display: none; }
  .vLargeTextField, textarea, .colM .aligned .vLargeTextField { width: 100%; }
}
@media (max-width: 767px) {
  #changelist .actions { display: flex; flex-wrap: wrap; gap: 8px; }
  #changelist .actions select { margin-left: 0; }
  .submit-row { flex-direction: column; }
  .submit-row a.deletelink { margin-left: 0; text-align: center; height: auto; }
  .login #container { margin: 20px auto; width: auto; }
}
`
