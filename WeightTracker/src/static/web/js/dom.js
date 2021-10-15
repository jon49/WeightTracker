class H {
   constructor(e = []) {
      this.refs = {}
      this.el = this._createEl(e)
   }

   _createEl(e) {
      let el =
         e[0] === void 0
            ? document.createDocumentFragment()
         : document.createElement(e[0] || 'div')
      for (let a of Object.entries(e[1])) {
         a[0] === "text"
            ? el.textContent = a[1]
         : a[0] === "update"
            ? (this._createUpdate(el, a[1]))
         : el.setAttribute(a[0], a[1])
      }
      if (e[2]) {
         el.append(...e[2].map(x => this._createEl(x)))
      }
      return el
   }

   _createUpdate(el, map) {
      Object.entries(map)
      .forEach(([key, attrs]) => {
         let ref = {el, attrs}
         if (!this.refs[key]) {
            this.refs[key] = [ref]
         } else {
            this.refs[key].push(ref)
         }
      })
   }

   update(data = {}) {
      Object.entries(data)
      .forEach(([key, val]) => {
         const updates = this.refs[key]
         if (!updates) return
         updates.forEach(({el, attrs}) => {
            attrs.forEach(attr => {
               if (attr === "text") el.textContent = val
               if (val) {
                  if (attr === "src" && el.src === val) return
                  el.setAttribute(attr, val)
               } else {
                  el.removeAttribute(attr)
               }
            })
         })
      })
   }
}


export const h = x => new H(x)
