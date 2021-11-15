const chars = {
    "&": "&amp;",
    ">": "&gt;",
    "<": "&lt;",
    '"': "&quot;",
    "'": "&#39;",
    "`": "&#96;",
};
// Dynamically create a RegExp from the `chars` object
const re = new RegExp(Object.keys(chars).join("|"), "g");
// Return the escaped string
function escape(str = "") {
    // @ts-ignore
    return String(str).replace(re, (match) => chars[match]);
}
let htmlPrototype = Object.getPrototypeOf(html);
function* typeChecker(sub, isRawHtml) {
    let type;
    if (!sub) {
    }
    else if ((type = typeof sub) === "string") {
        yield isRawHtml ? sub : escape(sub);
    }
    else if (type === "number") {
        yield "" + sub;
    }
    else if (Array.isArray(sub)) {
        for (let s of sub) {
            for (let x of typeChecker(s, true)) {
                yield x;
            }
        }
    }
    else if (sub.constructor === htmlPrototype) {
        for (let s of sub) {
            yield s;
        }
    }
    else {
        yield escape(sub.toString());
    }
}
function* html(literals, ...subs) {
    const lits = literals.raw, length = lits.length;
    let isRawHtml = true;
    for (let i = 0; i < length; i++) {
        let lit = lits[i];
        let sub = subs[i - 1];
        for (let s of typeChecker(sub, isRawHtml)) {
            yield s;
        }
        lit = (isRawHtml = lit.endsWith("$")) ? lit.slice(0, -1) : lit;
        if (lit)
            yield lit;
    }
}
export default html;
