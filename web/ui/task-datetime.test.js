const assert = require('assert/strict');
const dateTime = require('./task-datetime');

function local(year, month, day, hours, minutes) {
    const value = new Date(0);
    value.setFullYear(year, month - 1, day);
    value.setHours(hours, minutes, 0, 0);
    return value;
}

const now = local(2026, 6, 15, 10, 39);

{
    const result = dateTime.parseDisplayDateTime('15.06.2026 16:00');
    assert.equal(result.error, null);
    assert.equal(result.date.getFullYear(), 2026);
    assert.equal(result.date.getMonth(), 5);
    assert.equal(result.date.getDate(), 15);
    assert.equal(result.date.getHours(), 16);
    assert.equal(result.date.getMinutes(), 0);
    assert.equal(dateTime.formatDisplayDateTime(result.date), '15.06.2026 16:00');
}

{
    const result = dateTime.validateDueDate('16.06.2026 16:00', { now });
    assert.equal(result.valid, true);
    assert.equal(result.date.getFullYear(), 2026);
}

{
    const result = dateTime.validateDueDate('15.06.2026 10:39', { now });
    assert.equal(result.valid, true);
}

{
    const result = dateTime.validateDueDate('15.06.2026 10:38', { now });
    assert.equal(result.valid, false);
    assert.equal(result.message, dateTime.PAST_ERROR);
}

{
    const result = dateTime.validateDueDate('', { now });
    assert.equal(result.valid, false);
    assert.equal(result.message, dateTime.REQUIRED_ERROR);
}

{
    const result = dateTime.validateDueDate('2026-06-15T16:00', { now });
    assert.equal(result.valid, false);
    assert.equal(result.message, dateTime.FORMAT_ERROR);
}

{
    const result = dateTime.validateDueDate('15.06.0026 16:00', { now });
    assert.equal(result.valid, false);
    assert.equal(result.message, dateTime.FORMAT_ERROR);
}

console.log('task datetime tests passed');
