import { RoutePage } from "@jon49/sw/routes.middleware.js";

let { html, layout } = self.sw;

const route: RoutePage = {
  get: async () => {
    return layout({
      main: html`<i _load="redirect" data-url="/web/entries/edit">Redirecting...</i>`,
      title: "Weight Tracking",
    });
  },
};

export default route;
