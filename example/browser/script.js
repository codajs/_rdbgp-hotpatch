(function outer() {
  (function inner() {
    setInterval(function interval() {
      title.innerHTML = 'Hello';
    }, 1);
  }());
}());

