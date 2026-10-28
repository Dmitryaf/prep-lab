import { createApp } from "vue";
import App from "./app/App.vue";
import { router } from "./app/router";
import "./app/style.css";
document.title = "Подготовка к собеседованиям";
createApp(App).use(router).mount("#app");
