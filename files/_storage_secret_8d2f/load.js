/**
 * TOD (Tank Online Debugger) Toolkit
 * 包含完整的逆向解析、属性拦截及路径操作逻辑
 */
class TOD {
    constructor() {
        // 1. 初始化代理与全局环境
        new Proxy(window, { 
            set: (_, prop, val) => { window[prop] = val; return true; }, 
            deleteProperty: (_, prop) => { delete window[prop]; return true; } 
        });

        // 基础属性
        this.base64tank = "";
        this.regexes = [
            /(\w+)="\+this\.(\w+)\+"/g, 
            /(\w+)="\+this\.(\w+)(?:\(\)|\w*)\+/g, 
            /(\w+)\s*=\s*"\+this\.(\w+)/g, 
            /(\w+)="\+Td\(this\.(\w+)\)/g, 
            /(\w+)\s*=\s*(?:"\+)?\w+\(this\.(\w+)\)/g, 
            /(\w+):\s*"\+this\.(\w+)/g, 
            /(\w+)="\+new\s+iR\(this\.(\w+)\)/g
        ];

        // 屏蔽日志并备份
        window.log = console.log;
        console.info = console.log = () => {};
    }

    // --- 核心逻辑函数 ---

    extract(t, e, l, r) {
        let n, a = t.split(e);
        for (let c = 0; c < a.length; c++) {
            let f = a[c];
            if (l(f) && (n = r(f))) break;
        }
        return n;
    }

    changeLogo() {
        let link = document.querySelector("link[rel*='icon']") || document.createElement('link');
        link.type = 'image/x-icon';
        link.rel = 'icon';
        link.href = this.base64tank;
        document.head.appendChild(link);
    }

    dist(e, t) {
        e = Object.values(e), t = Object.values(t);
        let l = t[0] - e[0], s = t[1] - e[1], r = t[2] - e[2];
        return Math.sqrt(l * l + s * s + r * r);
    }

    apply(property, setter, getter) {
        return property && Object.defineProperty(Object.prototype, property, {
            get() {
                return getter ? getter.call(this, `_${property}_`, this[`_${property}_`]) : this[`_${property}_`];
            },
            set(value) {
                this[`_${property}_`] = setter ? setter.call(this, value) : value;
            },
            configurable: true
        });
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async getMain(url) {
        while (!(url = [...document.scripts].find(s => s.src.includes("/static/js/"))?.src)) 
            await this.sleep(100);
        return url.split("com")[1];
    }

    // --- 解析器逻辑 ---

    setup(str) {
        const introduce = (type, key, value) => {
            if (!window[type]) {
                window[type] = {};
                window[`_${type}`] = {};
            }
            if (!key || !value || value.includes(".") || window[`_${type}`][value]) return;

            if (!window[`_${type}`][value]) window[`_${type}`][value] = key;
            window[type][key] = window[type][key] ? `${window[type][key]},${value}` : value;
        };

        const handler = {
            parents: (a) => {
                let t = (a, t) => {
                    let r = [], e = t.matchAll(a);
                    for (let s of e) r.push([s[1], s[2]]);
                    return r;
                }, r = (a, t) => {
                    t.forEach(([t, r]) => { introduce("parents", a, r) });
                }, e = [{
                    classPattern: /"(\w+)\((.*?)\)"/,
                    paramPattern: /(\w+)="\+(?:\w+\()?(.+?)(?:\))?\+/g,
                    valueTransform: a => a.replace(/.*?([a-zA-Z0-9_]+)$/, "$1")
                }, {
                    classPattern: /"(\w+)\s*\["/,
                    paramPattern: /(\w+)\s*=\s*"\+this\.([a-zA-Z0-9_]+)/,
                    valueTransform: a => a
                }, {
                    classPattern: /"(\w+)\s*\["/,
                    paramPattern: /(\w+)\s*=\s*"\+\w+\(this\.([a-zA-Z0-9_]+)\)/g,
                    valueTransform: a => a
                }];
                for (let s of e) try {
                    let n = a.match(s.classPattern);
                    if (!n) continue;
                    let l = n[1], c = t(s.paramPattern, a).map(([a, t]) => [a, s.valueTransform(t)]);
                    if (c.length) return r(l, c);
                } catch (f) { continue; }
            },
            toStrings: (l) => {
                if (!l.includes('"')) return;
                handler.parents(l);
                let t;
                for (let e of this.regexes) {
                    let c = l.matchAll(e);
                    for (let o of c) {
                        let [i, n, r] = o;
                        introduce("collection", n, r), t = !0;
                    }
                }
                let f = l.match(/"([^(]+)/)[1].trim().toLowerCase(),
                    a = [...l.matchAll(/this\.(\w+)/g)],
                    h = [" ", "[", "+"];
                a.forEach((l, e) => {
                    let [c, o, i] = l, n = `${f}_${e + 1}`, r = !h.find(l => n.includes(l) || o.includes(l));
                    introduce("collection", n, i), t = r && i;
                });
            },
            callableNames: (l) => {
                let t = /function\s+([^(]+)|callableName\s*=\s*"([^"]+)"/g, i = null, e;
                for (; null !== (e = t.exec(l));) e[1] ? i = e[1] : e[2] && i && introduce("callable", e[2], i);
                let s = ["targetingSystem", "angularVelocity", "chatModeratorLevel", "linksWhiteList"],
                    a = ["n", "t", "i"];
                s.forEach(t => {
                    let i = l.split(`"${t}")`)[0], e = i.split("if(").pop().split(";")[1].split("(")[0];
                    a.forEach(t => {
                        l.split(`if(null!=${t})return ${t};${e}("`).slice(1).forEach((l, i, e) => {
                            let [s, a] = [l.split('"')[0], e[i - 1]?.slice(-20).split(`${t}=`)[1]?.split(".")[1]?.split(";")[0]];
                            introduce("collection", s, a);
                        });
                    });
                });
            },
        };

        let chunks = str.split(`).toString=function(){`);
        chunks.shift();
        for (let chunk of chunks) handler.toStrings(chunk.split("}")[0]);
        handler.callableNames(str);
    }

    // --- 数据与路径操作 ---

    getNames(arr, maxDepth = 2) {
        const clonedInput = Array.isArray(arr) ? [...arr] : { ...arr };
        const replace = (obj, depth, path) => {
            if (depth > maxDepth) return obj;
            if (Array.isArray(obj)) {
                return obj.map((item, index) => replace(item, depth + 1, `${path}[${index}]`));
            } else if (typeof obj === 'object' && obj !== null) {
                const newObj = {};
                for (const key of Object.keys(obj)) {
                    let newKey = _collection[this.devanilla(key)] || _callable[obj?.__proto__?.constructor?.name] || this.byProto(obj) || key;
                    if (!this.devanilla(key)) {
                        if (obj[key] && typeof obj[key] === "object" && !Array.isArray(obj[key])) {
                            Object.keys(obj[key]).forEach(c => {
                                let parent = _parents[this.devanilla(c)];
                                if (parent) newKey = parent;
                            });
                        }
                    }
                    newObj[newKey] = replace(obj[key], depth + 1, `${path}.${newKey}`);
                }
                return newObj;
            }
            return obj;
        };
        return replace(clonedInput, 0, '');
    }

    devanilla(str) {
        if (str.startsWith("_") && str.endsWith("_")) return str.slice(1, -1);
        return str;
    }

    byIndex(obj, ...args) {
        if (!obj) return;
        let res = obj;
        for (let i = 0; i < args.length; i++) {
            let index = args[i];
            if (typeof index === "number" && res) res = Object.values(res);
            if (res) res = res[index];
        }
        return res;
    }

    setByIndex(obj, ...args) {
        if (!obj) return;
        let value = args[args.length - 1];
        let res = obj;
        for (let i = 0; i < args.length - 1; i++) {
            let index = args[i];
            if (i === args.length - 2) {
                res[Object.keys(res)[index]] = value;
            } else {
                if (typeof index === "number") res = Object.values(res);
                res = res[index];
            }
        }
        return res;
    }

    byPath(obj, path) {
        if (!obj) return;
        try {
            path = path.split(".");
            let res = obj;
            for (let i = 0; i < path.length; i++) {
                let index = path[i];
                if (typeof index === "number") {
                    res = Object.values(res)[index];
                } else {
                    let keys = Object.keys(res);
                    for (let key of keys) {
                        if (_collection[this.devanilla(key)] === index) {
                            res = res[key];
                        } else if (res[key] && typeof res[key] === "object" && !Array.isArray(res[key])) {
                            Object.keys(res[key]).find(c => {
                                if (_parents[this.devanilla(c)] === index) res = res[key];
                            });
                        }
                    }
                }
            }
            return res;
        } catch (e) { }
        return null;
    }

    setByPath(obj, path, value) {
        if (!obj) return;
        path = path.split(".");
        let res = obj;
        for (let i = 0; i < path.length; i++) {
            let index = path[i];
            let end = i === path.length - 1;
            if (typeof index === "number") {
                res = Object.values(res)[index];
                if (end) console.log(res);
            } else {
                let keys = Object.keys(res);
                for (let key of keys) {
                    let unique = _collection[this.devanilla(key)];
                    if (unique === index) {
                        if (end) res[key] = value;
                        res = res[key];
                    } else if (res[key] && typeof res[key] === "object" && !Array.isArray(res[key])) {
                        Object.keys(res[key]).find(c => {
                            let _unique = _parents[this.devanilla(c)];
                            if (_unique === index) {
                                res = res[key];
                            }
                        });
                    }
                }
            }
        }
        return res;
    }

    copyItem(item, item2) {
        let values = Object.values(item);
        values.forEach((value, index) => {
            this.setByIndex(item, index, this.byIndex(item2, index));
        });
    }

    byProto(obj) {
        let proto = obj?.__proto__;
        if (!proto) return null;
        const takeName = (str) => {
            return str.includes(`callableName="`) ? str.split(`callableName="`)[1].split(`"`)[0] : null;
        };
        let keys = Object.keys(proto);
        let name = null;
        for (let key of keys) {
            let temp = takeName(proto[key].toString());
            if (temp) name = `${name ? `${name}_` : ""}${temp}`;
        }
        return name;
    }
}

// 实例化并挂载到 window
window.TOD = new TOD();