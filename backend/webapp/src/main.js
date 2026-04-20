import "./style.css";
import { route, startRouter } from "./router.js";
import { homePage } from "./pages/home.js";
import { productsPage } from "./pages/products.js";
import { productDetailPage } from "./pages/product-detail.js";
import { sessionsPage } from "./pages/sessions.js";
import { sessionDetailPage } from "./pages/session-detail.js";

route("/", homePage);
route("/products", productsPage);
route("/products/:id", productDetailPage);
route("/sessions", sessionsPage);
route("/sessions/:id", sessionDetailPage);

startRouter(document.getElementById("app"));
