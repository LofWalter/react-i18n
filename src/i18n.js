import Jed from 'jed';
import React from 'react';
import {Text} from 'react-native';
import {sprintf} from './sprintf-js-mod';
import _ from 'lodash';

const DOMAIN = 'i18n';

let LOCALE_DEBUG = false;

let i18n = null;
let _cache = {};

export function setLocale(jedInstance) {
  i18n = jedInstance;
}

export function setDebug() {
  LOCALE_DEBUG = true;
}

setLocale(new Jed({
  'domain': DOMAIN,
  'missing_key_callback': function (key) {
  },
  'locale_data': {
    [DOMAIN]: {
      '': {
        'domain': DOMAIN,
        'lang': 'en',
        'plural_forms': 'nplurals=2; plural=(n != 1);'
      }
    }
  }
}));

function formatForReact(formatString, args) {
  let rv = [];
  let cursor = 0;

  // always re-parse, do not cache, because we change the match
  sprintf.parse(formatString).forEach((match, idx) => {
    if (_.isString(match)) {
      rv.push(match);
    } else {
      let arg = null;
      if (match[2]) {
        arg = args[0][match[2][0]];
      } else if (match[1]) {
        arg = args[parseInt(match[1], 10) - 1];
      } else {
        arg = args[cursor++];
      }

      // this points to a react element!
      if (React.isValidElement(arg)) {
        rv.push(React.cloneElement(arg, {key: idx}));
        // not a react element, fuck around with it so that sprintf.format
        // can format it for us.  We make sure match[2] is null so that we
        // do not go down the object path, and we set match[1] to the first
        // index and then pass an array with two items in.
      } else {
        match[2] = null;
        match[1] = 1;
        rv.push(<Text key={idx++}>
          {sprintf.format([match], [null, arg])}
        </Text>);
      }
    }
  });

  return rv;
}

function argsInvolveReact(args) {
  if (args.some(React.isValidElement)) {
    return true;
  }
  if (args.length == 1 && _.isObject(args[0])) {
    return Object.keys(args[0]).some((key) => {
      return React.isValidElement(args[0][key]);
    });
  }
  return false;
}

function parseComponentTemplate(string) {
  let rv = {};

  function process(startPos, group, inGroup) {
    let regex = /\[(.*?)(:|\])|\]/g;
    let match;
    let buf = [];
    let satisfied = false;

    let pos = regex.lastIndex = startPos;
    while ((match = regex.exec(string)) !== null) { // eslint-disable-line no-cond-assign
      let substr = string.substr(pos, match.index - pos);
      if (substr !== '') {
        buf.push(substr);
      }

      if (match[0] == ']') {
        if (inGroup) {
          satisfied = true;
          break;
        } else {
          pos = regex.lastIndex;
          continue;
        }
      }

      if (match[2] == ']') {
        pos = regex.lastIndex;
      } else {
        pos = regex.lastIndex = process(regex.lastIndex, match[1], true);
      }
      buf.push({group: match[1]});
    }

    let endPos = regex.lastIndex;
    if (!satisfied) {
      let rest = string.substr(pos);
      if (rest) {
        buf.push(rest);
      }
      endPos = string.length;
    }

    rv[group] = buf;
    return endPos;
  }

  process(0, 'root', false);

  return rv;
}

function renderComponentTemplate(template, components) {
  let idx = 0;

  function renderGroup(group) {
    let children = [];

    (template[group] || []).forEach((item) => {
      if (_.isString(item)) {
        children.push(<Text key={idx++}>{item}</Text>);
      } else {
        children.push(renderGroup(item.group));
      }
    });

    // in case we cannot find our component, we call back to an empty
    // span(Text) so that stuff shows up at least.
    let reference = components[group] || <Text key={idx++}/>;
    if (!React.isValidElement(reference)) {
      reference = <Text key={idx++}>{reference}</Text>;
    }

    if (children.length > 0) {
      return React.cloneElement(reference, {key: idx++}, children);
    } else {
      return React.cloneElement(reference, {key: idx++});
    }
  }

  return renderGroup('root');
}

function mark(rv) {
  if (!LOCALE_DEBUG) {
    return rv;
  }

  let proxy = {
    $$typeof: Symbol.for('react.element'),
    type: 'Text',
    key: null,
    ref: null,
    props: {
      className: 'translation-wrapper',
      children: _.isArray(rv) ? rv : [rv]
    },
    _owner: null,
    _store: {}
  };

  proxy.toString = function () {
    return '🇦🇹' + rv + '🇦🇹';
  };

  return proxy;
}

function cacheGettext(string) {
  return _cache[string] || (_cache[string] = i18n.gettext(string));
}

function format(formatString, args) {
  if (argsInvolveReact(args)) {
    return formatForReact(formatString, args);
  } else {
    return sprintf(formatString, ...args);
  }
}

export function gettext(string, ...args) {
  let rv = cacheGettext(string);
  if (args.length > 0) {
  	rv = format(rv, args)
  }
  return mark(rv);
}

export function ngettext(singular, plural, ...args) {
  return mark(format(i18n.ngettext(singular, plural, args[0] || 0), args));
}

/* special form of gettext where you can render nested react
 components in template strings.  Example:

 gettextComponentTemplate('Welcome. Click [link:here]', {
 root: <p/>,
 link: <a href="#" />
 });

 the root string is always called "root", the rest is prefixed
 with the name in the brackets */
export function gettextComponentTemplate(template, components) {
  let tmpl = parseComponentTemplate(i18n.gettext(template));
  return mark(renderComponentTemplate(tmpl, components));
}

export const t = gettext;
export const tn = ngettext;
export const tct = gettextComponentTemplate;
