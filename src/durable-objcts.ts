import { DurableObject } from 'cloudflare:workers';
import { Env } from 'hono';

// Manages seat assignment for a flight.
//
// This is an RPC interface. The methods can be called remotely by other Workers
// running anywhere in the world. All Workers that specify same object ID
// (probably based on the flight number and date) will reach the same instance of
// FlightSeating.
export class MyDurableObject extends DurableObject {
  sql: SqlStorage;
  enableSql = true;
  
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;

    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS seats (
        seatId TEXT PRIMARY KEY,  -- e.g. "3B"
        occupant TEXT             -- null if available
      )
    `);
  }

  // Application calls this when the flight is first created to set up the seat map.
  initializeFlight(seatList: string[]) {
    for (let seat of seatList) {
      this.sql.exec(`INSERT INTO seats VALUES (?, null)`, seat);
    }
  }

  // Get a list of available seats.
  getAvailable() {
    let results = [];

    // Query returns a cursor.
    let cursor = this.sql.exec(`SELECT seatId FROM seats WHERE occupant IS NULL`);

    // Cursors are iterable.
    for (let row of cursor) {
      // Each row is an object with a property for each column.
      results.push(row.seatId);
    }

    return results;
  }

  // Assign passenger to a seat.
  assignSeat(seatId: string, occupant: string) {
    // Check that seat isn't occupied.
    let cursor = this.sql.exec(`SELECT occupant FROM seats WHERE seatId = ?`, seatId);
    let result = [...cursor][0]; // Get the first result from the cursor.
    if (!result) {
      throw new Error('No such seat: ' + seatId);
    }
    if (result.occupant !== null) {
      throw new Error('Seat is occupied: ' + seatId);
    }

    // If the occupant is already in a different seat, remove them.
    this.sql.exec(`UPDATE seats SET occupant = null WHERE occupant = ?`, occupant);

    // Assign the seat. Note: We don't have to worry that a concurrent request may
    // have grabbed the seat between the two queries, because the code is synchronous
    // (no `await`s) and the database is private to this Durable Object. Nothing else
    // could have changed since we checked that the seat was available earlier!
    this.sql.exec(`UPDATE seats SET occupant = ? WHERE seatId = ?`, occupant, seatId);
  }
}
