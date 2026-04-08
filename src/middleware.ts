import { defineMiddleware } from "astro:middleware";

export const onRequest = defineMiddleware(({ request }, next) => {
  const host = new URL(request.url).hostname;
  if (host.includes("southbaysignal")) {
    const url = new URL(request.url);
    url.hostname = "www.southbaytoday.org";
    url.port = "";
    return Response.redirect(url.toString(), 301);
  }
  return next();
});
