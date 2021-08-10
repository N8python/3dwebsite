const localProxy = new Proxy(localStorage, {
    get(_, prop) {
        prop = "_nw__" + prop;
        return (localStorage[prop] !== undefined) ? (localStorage[prop] === "undefined") ? undefined : JSON.parse(localStorage[prop]) : undefined;
    },
    set(_, prop, val) {
        prop = "_nw__" + prop;
        localStorage[prop] = JSON.stringify(val);
        return true;
    },
    deleteProperty(_, prop) {
        delete localStorage[prop];
    }
});