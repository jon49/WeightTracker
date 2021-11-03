// @ts-check
/// <reference path="./hash-template.d.ts" />

/**
 * @typedef { import("./hash-template-util").PropertyAttributes } PropertyAttributes
 * @typedef { import("./hash-template-util").HashTreeWalker } HashTreeWalker
 * @typedef { import("./hash-template-util").Paths } Paths
 * @typedef { import("./hash-template-util").Refs } Refs
 * @typedef { import("./hash-template-util").Names } Names
 * @typedef { import("./hash-template-util").Nodes } Nodes
 */

/**
 * @param {Node} node 
 * @returns {PropertyAttributes|0}
 */
function collector(node) {
  if (node instanceof HTMLElement && node.attributes !== undefined) {
    const values = {}
    let setValues = false
    for(let attr of Array.from(node.attributes)) {
        let aName = attr.name
        if (aName[0] === '#') {
            const attrs =
                aName.length > 1
                    ? aName.slice(1).split(',')
                : []
            const name = attr.value
            if (name in values) values[name].push(...attrs)
            else values[name] = attrs
            node.removeAttribute(aName)
            setValues = true
        }
    }
    return /** @type {*} */(setValues ? values : 0)
  } else {
    let nodeData = node.nodeValue
    if (nodeData[0] === '#') {
      node.nodeValue = ""
      return { [nodeData.slice(1)]: [] }
    }
    return 0
  }
}

/**
 * @type {HashTreeWalker}
 */
// @ts-ignore
const TREE_WALKER = document.createTreeWalker(document, NodeFilter.SHOW_ALL, null, false)
TREE_WALKER.roll = function(n) {
  while(--n) this.nextNode()
  return this.currentNode
}

const genPath = (() => {
  let id = 0
  /**
   * @param {Node} node 
   * @returns {Paths}
   */
  const pathGenerator = node => {
    const w = TREE_WALKER
    w.currentNode = node

    /** @type {Refs} */
    let refs = {}
    /** @type {Names} */
    let names = {}
    let indices = [], idx = 0
    /** @type {PropertyAttributes|0} */
    let ref
    do {
      if (ref = collector(node)) {
        const i = idx + 1
        refs[id] = ref
        for (const name of Object.keys(ref)) {
          if (!(name in names)) names[name] = [id]
          else names[name].push(id)
        }
        indices.push({idx: i, id})
        idx = 1
      } else {
        idx++
      }
      id++
    } while(node = w.nextNode())

    return { refs, names, indices }
  }
  return pathGenerator
})();

/**
 * @param {Node} node
 * @param {Paths} paths
 * @returns {Nodes}
 */
function walker(node, paths) {
  /** @type {{[key: number]: Node}} */
  const refs = {}

  const w = TREE_WALKER
  w.currentNode = node

  paths.indices.map(x => refs[x.id] = w.roll(x.idx))

  return refs
}

/**
 * @template T
 */
class Template {
  /**
   * @param {Node} node
   * @param {Paths} paths
   * @param {Partial<T>} [o]
   * @param {HTMLElement} [element]
   */
  constructor(node, paths, o, element) {
    this._refPaths = paths
    this.root = element ? element : node.cloneNode(true)
    this._nodes = walker(this.root, this._refPaths)
    if (o) this.update(o)
  }

  /**
   * @param {string[]} keys
   * @returns {Partial<Nodes>}
   */
  getNodes(keys) {
    const nodes = {}
    for (const key of keys) {
      nodes[key] = this._nodes[this._refPaths.names[key][0]]
    }
    return nodes
  }

  /**
   * @param {Partial<T>} o
   */
  update(o) {
    if (!o) return
    Object.keys(o)
    .forEach(key => {
      /**
       * @param {string | number} idx
       */
      this._refPaths.names[key]
      ?.forEach(idx => {
        const n = this._nodes[idx]
        if (n instanceof Text) {
          n.nodeValue = o[key]
        } else if (n instanceof HTMLElement) {
          const attrs = this._refPaths.refs[idx]
          /**
           * @param {string} x
           */
          if (attrs[key]) {
            attrs[key].forEach(x => x === "text" ? n.textContent = o[key] : n.setAttribute(x, o[key]))
          } else { console.error(`Key '${key}' value not defined.`) }
        }
      })
    })
    return this
  }
}

const compilerTemplate = document.createElement("x")
/**
 * @param {TemplateStringsArray} strings
 * @param {any[]} args
 */
function h(strings, ...args) {
  const template = String.raw(strings, ...args)
  compilerTemplate.innerHTML = template
  return compilerTemplate.firstElementChild
}

/**
 * @template T
 * @param {HTMLTemplateElement|Element|TemplateStringsArray} node
 * @param {any[]} args
 * @returns {(o?: Partial<T>) => Template<T>}
 */
export default function template(node, ...args) {
  /** @type {Node} */
  const n =
    node instanceof HTMLTemplateElement
      ? node.content.firstElementChild
    : node instanceof Element
      ? node
    : h(node, ...args)
  const paths = genPath(n)
  return (/** @type {Partial<any>} */ o, /** @type {HTMLElement} */ element) => new Template(n, paths, o, element)
}
