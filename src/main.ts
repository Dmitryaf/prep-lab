import { createApp } from "vue";
import App from "./app/App.vue";
import { router } from "./app/router";
import "./app/style.css";
import {trackWindow} from './app/lifecycle';
document.title = "Frontend Lab";
createApp(App).use(router).mount("#app");
trackWindow();
