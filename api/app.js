const express = require('express')
const bodyParser = require('body-parser')
const fs = require('fs')
const app = express()

const port = process.env.PORT || 7000

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({
    extended: true,
}));

const SeatType = {
  standard: 0,
  vip: 1,
  recliner: 2,
  wheel: 3,
  notBookable: 4,
  occupied: 5
}

let convertToSeatType = function(i) {
  switch (i) {
    case 0: return SeatType.standard;
    case 1: return SeatType.vip;
    case 2: return SeatType.recliner;
    case 3: return SeatType.wheel;
    case 4: return SeatType.notBookable;
    case 5: return SeatType.occupied;
    default: return null;
  }
}

class Position {
  constructor(x, y) {
    this.x = x;
    this.y = y;
  }
}

class Seat {
  constructor(type, enable, position, price) {
    this.type = type;
    this.enable = enable;
    this.position = position;
    this.price = price;
  }

  isBooked() {
    // console.log('booked', bookedSeat[this.position.y][this.position.x]);
    return bookedSeat[this.position.y][this.position.x] != null;
  }
}

class BlockedSeat {
  constructor(id, expired) {
    this.id = id;
    this.expired = expired;
  }

  isExpired() {
    console.log(this.expired, Date.now(), this.expired < Date.now());
    return this.expired < Date.now();
  }
}

class Theater {
  constructor(rows, cols, seats) {
    this.rows = rows;
    this.cols = cols;
    this.seats = seats;
  }
}

let readFile = function(file) {
  let
    remaining = "",
    lineFeed = "\n",
    lineNr = 0;
  var cols = 0,
    rows = 0,
    result = [];
  return new Promise((resolve, reject) => {
    let stream = fs.createReadStream(file, {encoding: 'utf-8'})
    stream.on('data', function (chunk) {
      // store the actual chunk into the remaining
      remaining = remaining.concat(chunk);

      // look that we have a linefeed
      var lastLineFeed = remaining.lastIndexOf(lineFeed);

      // if we don't have any we can continue the reading
      if (lastLineFeed === -1) return;

      var
        current = remaining.substring(0, lastLineFeed),
        lines = current.split(lineFeed);

      // store from the last linefeed or empty it out
      remaining = (lastLineFeed > remaining.length)
        ? remaining.substring(lastLineFeed + 1, remaining.length)
        : "";


      let i = 0, length = lines.length;
      for (; i < length; i++) {
        // process the actual line
        const numbers = _processLine(lines[i], lineNr++);
        if (i == 0) {
          cols = numbers[0];
          rows = numbers[1];
        } else {
          let len = numbers.length;
          // console.log(numbers)
          let rows = [];
          let bookedRows = [];
          for (let x = 0; x < len; x++) {
            rows.push(null);
            bookedRows = [];
            let seatType = convertToSeatType(numbers[x]);
            if (seatType != null) {
              let seat = new Seat(seatType, true, new Position(x, i-1), 10);
              result.push(seat);
            }
          }
          markedSeat.push(rows);
          bookedSeat.push(bookedRows);
        }
      }
    })
    stream.on("error", err => reject(err));
    stream.on("end", () => resolve(new Theater(
        rows,
        cols,
        result)
      ));
  });
}

function _processLine(line, lineNumber) {
  // UPDATE2 with parseFloat
  let numbers = line.split(" ").map(function (item) { return parseInt(item); });
  // console.log(numbers, lineNumber);
  return numbers;
}

let theater;
let markedSeat = [];
let bookedSeat = []

app.get('/theater', (req, res) => {
  let seats = [];
  theater.seats.forEach(seat => {
    let s = new Seat(seat.type, seat.enable, seat.position, seat.price);
    let blocked = markedSeat[seat.position.y][seat.position.x];
    if (s.isBooked() || (blocked != null && !blocked.isExpired())) {
      console.log(blocked, blocked.isExpired())
      s.type = SeatType.occupied;
    }
    seats.push(s);
  });

  res.send(new Theater(
    theater.rows, theater.cols, seats
  ));
})

app.post('/check-seat', (req, res) => {
  let id = req.header("id")
  console.log(id, req.body)
  let selectSeat = theater.seats.find(seat => seat.position.x === req.body.x && seat.position.y === req.body.y);
  console.log(selectSeat)
  let blocked = markedSeat[req.body.y][req.body.x];
  if (selectSeat.isBooked() || (blocked != null && blocked.id !== id && !blocked.isExpired())) {
    console.log('seat in locked', blocked)
    res.status(401).send({
       message: 'Seat is not available'
    });
    return;
  }
  if (req.body.isSelected) {
      console.log('add seat to blockedSeat')
      markedSeat[req.body.y][req.body.x] = new BlockedSeat(id, Date.now() + 60000);
      res.send({
        'seat': selectSeat,
        'isSelected': req.body.isSelected,
      });
  } else {
    markedSeat[req.body.y][req.body.x] = null;
    res.send({
      'seat': selectSeat,
      'isSelected': req.body.isSelected,
    });
  }
})

app.post('/booking', (req, res) => {
  let id = req.header("id")
  console.log(id, req.body)
  if (req.body.positions != null) {
    let positions = JSON.parse(req.body.positions);
    let length = positions.length;
    for(let i = 0; i < length; i++) {
      let position = positions[i];
      let p = new Position(position.x, position.y);
      let selectSeat = theater.seats.find(seat => seat.position.x === p.x && seat.position.y === p.y);
      console.log(selectSeat);
      let blocked = markedSeat[p.y][p.x];
      if (selectSeat.isBooked() || (blocked != null && blocked.id !== id && !blocked.isExpired())) {
        console.log('seat in locked', blocked)
        res.status(401).send({
          isSuccess: false,
          message: 'Seat is not available'
        });
        return;
      }
      bookedSeat[p.y][p.x] = id;
    }
    res.send({
      isSuccess: true,
      message: 'Success'
    });
  }
})

// Start the server
module.exports = app.listen(port, (error) => {
    if (error) return console.log(`Error: ${error}`);
    readFile(__dirname + "/theater.txt").then(res => theater = res);
    console.log(`Server listening on port ${server.address().port}`);
});