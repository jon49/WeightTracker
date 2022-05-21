window.addEventListener('load', function() {
    navigator.serviceWorker.register('/web/sw.js').then(function(registration) {
        console.log('ServiceWorker registration successful with scope: ', registration.scope);
    }, function(error) {
        console.log(error)
    });
});
