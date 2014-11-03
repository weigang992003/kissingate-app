var Prime = function() {
    this.prime = 1;
};

Prime.prototype.nextPrime = function() {
    var self = this;
    self.prime++;
    while (!isPrime(self.prime)) self.prime++;
    return self.prime;
}

function isPrime(num) {
    var result = true;
    if (num !== 2) {
        if (num % 2 == 0) {
            result = false;
        } else {
            for (x = 3; x <= Math.sqrt(num); x += 2) {
                if (num % x == 0) result = false;
            }
        }
    }

    return result;
};

exports.Prime = Prime;