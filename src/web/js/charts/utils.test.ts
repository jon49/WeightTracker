import { test, suite } from 'node:test'
import { strictEqual, deepStrictEqual } from 'node:assert'
import { bedtimeSuccess, timeToNumber } from '../../js/charts/_utils.js'

suite('Chart Utils', () => {
    suite('bedtimeSuccess', () => {
        test('should return 0 when there is a perfect score.', () => {
            deepStrictEqual(bedtimeSuccess([23, 13], 23), [1, 1])
        });

        test('should return a decimal between 0 and 1.', () => {
            deepStrictEqual(bedtimeSuccess([23.5, 0, 3], 23), [0.958, 0.917, 0.667])
        })
    })

    suite('timeToNumber', () => {
        test('should return the number of hours and minutes as a decimal.', () => {
            strictEqual(timeToNumber('13:30'), 13.5)
            strictEqual(timeToNumber('23:59'), 23.983)
            strictEqual(timeToNumber('00:00'), 0)
        })
    })
})


