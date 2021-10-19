// @ts-check

function update(data = {}, refs) {
   Object.entries(data)
   .forEach(([key, val]) => {
      const updates = refs[key]
      if (!updates) return
      updates.forEach(({el, attrs}) => {
         attrs.forEach(attr => {
            if (attr === "text") {
               el.textContent = val
            } else if (val) {
               if (attr === "src" && el.src === val) return
               el.setAttribute(attr, val)
            } else {
               el.removeAttribute(attr)
            }
         })
      })
   })
}

function createUpdate(el, map, refs) {
   Object.entries(map)
   .forEach(([key, attrs]) => {
      let ref = {el, attrs}
      if (!refs[key]) {
         refs[key] = [ref]
      } else {
         refs[key].push(ref)
      }
   })
}

function mergeRefs(ref1, ref2) {
   for (const [key, refs] of Object.entries(ref2)) {
      if (ref1[key]) {
         ref1[key].push(...refs)
      } else {
         ref1[key] = refs
      }
   }
}

export default (name, props, ...rest) => {
   const refs = { }
   const children = [];
   const nameType = typeof name;
   const contains_attributes = typeof props === "object" && !(props instanceof Node || props.refs);
   let el;
   let template = false;

   if (nameType !== "string") {
      el = document.createDocumentFragment();
      template = true;
      if (name.refs) {
         mergeRefs(refs, name.refs)
      }
      if (name instanceof Node) {
         children.push(name);
      }
   } else if (name === "svg") {
      el = document.createElementNS("http://www.w3.org/2000/svg", name);
   } else {
      el = document.createElement(name);
   }

   if (props) {
      if (contains_attributes && !template) {
         for (let prop of Object.keys(props)) {
            if (prop === "$") {
               createUpdate(el, props[prop], refs)
            } else {
               el.setAttribute(prop, props[prop])
            }
         }
      } else {
         children.push(props);
      }
   }

   children.push(...rest);

   children.forEach(child => {
      if (typeof child === "string") {
         el.appendChild(document.createTextNode(child))
      } else {
         if (child.refs) {
            mergeRefs(refs, child.refs)
         }
         el.appendChild(child instanceof Node ? child : document.createElement(child) )
      }
   });

   if (refs) {
      el.refs = refs
      el.update = data => update(data, refs)
   }
   return el
}
