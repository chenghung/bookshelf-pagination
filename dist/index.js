'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _slicedToArray = function () { function sliceIterator(arr, i) { var _arr = []; var _n = true; var _d = false; var _e = undefined; try { for (var _i = arr[Symbol.iterator](), _s; !(_n = (_s = _i.next()).done); _n = true) { _arr.push(_s.value); if (i && _arr.length === i) break; } } catch (err) { _d = true; _e = err; } finally { try { if (!_n && _i["return"]) _i["return"](); } finally { if (_d) throw _e; } } return _arr; } return function (arr, i) { if (Array.isArray(arr)) { return arr; } else if (Symbol.iterator in Object(arr)) { return sliceIterator(arr, i); } else { throw new TypeError("Invalid attempt to destructure non-iterable instance"); } }; }();

var _bluebird = require('bluebird');

var _bluebird2 = _interopRequireDefault(_bluebird);

var _lodash = require('lodash');

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _objectWithoutProperties(obj, keys) { var target = {}; for (var i in obj) { if (keys.indexOf(i) >= 0) continue; if (!Object.prototype.hasOwnProperty.call(obj, i)) continue; target[i] = obj[i]; } return target; }
/**
 * Module dependencies.
 */

const DEFAULT_LIMIT = 10;
const DEFAULT_OFFSET = 0;
const DEFAULT_PAGE = 1;

/**
 * Export `bookshelf-pagination` plugin.
 */

exports.default = Bookshelf => {
  /**
   * @method Model#fetchPage
   * @belongsTo Model
   *
   * Similar to {@link Model#fetchAll}, but fetches a single page of results
   * as specified by the limit (page size) and offset or page number.
   *
   * Any options that may be passed to {@link Model#fetchAll} may also be passed
   * in the options to this method.
   *
   * To perform pagination, you may include *either* an `offset` and `limit`, **or**
   * a `page` and `pageSize`.
   *
   * By default, with no parameters or missing parameters, `fetchPage` will use an
   * options object of `{page: 1, pageSize: 10}`
   *
   *
   * Below is an example showing the user of a JOIN query with sort/ordering,
   * pagination, and related models.
   *
   * @example
   *
   * Car
   * .query(function (qb) {
   *    qb.innerJoin('manufacturers', 'cars.manufacturer_id', 'manufacturers.id');
   *    qb.groupBy('cars.id');
   *    qb.where('manufacturers.country', '=', 'Sweden');
   * })
   * .orderBy('-productionYear') // Same as .orderBy('cars.productionYear', 'DESC')
   * .fetchPage({
   *    pageSize: 15, // Defaults to 10 if not specified
   *    page: 3, // Defaults to 1 if not specified
   *
   *    // OR
   *    // limit: 15,
   *    // offset: 30,
   *
   *    withRelated: ['engine'] // Passed to Model#fetchAll
   * })
   * .then(function (results) {
   *    console.log(results); // Paginated results object with metadata example below
   * })
   *
   * // Pagination results:
   *
   * {
   *    models: [<Car>], // Regular bookshelf Collection
   *    // other standard Collection attributes
   *    ...
   *    pagination: {
   *        rowCount: 53, // Total number of rows found for the query before pagination
   *        pageCount: 4, // Total number of pages of results
   *        page: 3, // The requested page number
   *        pageSze: 15, // The requested number of rows per page
   *
   *  // OR, if limit/offset pagination is used instead of page/pageSize:
   *        // offset: 30, // The requested offset
   *        // limit: 15 // The requested limit
   *    }
   * }
   *
   * @param options {object}
   *    The pagination options, plus any additional options that will be passed to
   *    {@link Model#fetchAll}
   * @returns {Promise<Model|null>}
   */
  function fetchPage() {
    let options = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {};

    const page = options.page,
          pageSize = options.pageSize,
          limit = options.limit,
          offset = options.offset,
          fetchOptions = _objectWithoutProperties(options, ['page', 'pageSize', 'limit', 'offset']);

    let usingPageSize = false; // usingPageSize = false means offset/limit, true means page/pageSize
    let _page;
    let _pageSize;
    let _limit;
    let _offset;

    function ensureIntWithDefault(val, def) {
      if (!val) {
        return def;
      }

      const _val = parseInt(val);
      if (Number.isNaN(_val)) {
        return def;
      }

      return _val;
    }

    if (!limit && !offset) {
      usingPageSize = true;

      _pageSize = ensureIntWithDefault(pageSize, DEFAULT_LIMIT);
      _page = ensureIntWithDefault(page, DEFAULT_PAGE);

      _limit = _pageSize;
      _offset = _limit * (_page - 1);
    } else {
      _pageSize = _limit; // not used, just for eslint `const` error
      _limit = ensureIntWithDefault(limit, DEFAULT_LIMIT);
      _offset = ensureIntWithDefault(offset, DEFAULT_OFFSET);
    }

    const tableName = this.constructor.prototype.tableName;
    const idAttribute = this.constructor.prototype.idAttribute ? this.constructor.prototype.idAttribute : 'id';

    const paginate = () => {
      // const pageQuery = clone(this.query());
      const pager = this.constructor.forge();

      return pager.query(qb => {
        (0, _lodash.assign)(qb, this.query().clone());
        qb.limit.apply(qb, [_limit]);
        qb.offset.apply(qb, [_offset]);
        return null;
      }).fetchAll(fetchOptions);
    };

    const count = () => {
      const notNeededQueries = ['orderByBasic', 'orderByRaw'];
      const groupQueries = ['groupByBasic', 'groupByRaw'];
      const counter = this.constructor.forge();

      return counter.query(qb => {
        (0, _lodash.assign)(qb, this.query().clone());

        const statementTypes = (0, _lodash.map)(qb._statements, statement => statement.type);
        const containGroupBy = (0, _lodash.intersection)(statementTypes, groupQueries).length > 0;
        if (containGroupBy) {
          console.log('count group by SQL', qb.toSQL());
        }

        // Remove grouping and ordering. Ordering is unnecessary
        // for a count, and grouping returns the entire result set
        // What we want instead is to use `DISTINCT`
        (0, _lodash.remove)(qb._statements, statement => {
          return notNeededQueries.indexOf(statement.type) > -1 || statement.grouping === 'columns';
        });
        qb.countDistinct.apply(qb, [`${ tableName }.${ idAttribute }`]);
      }).fetchAll().then(result => {

        const metadata = usingPageSize ? { page: _page, pageSize: _limit } : { offset: _offset, limit: _limit };

        if (result && result.length == 1) {
          // We shouldn't have to do this, instead it should be
          // result.models[0].get('count')
          // but SQLite uses a really strange key name.
          const count = result.models[0];
          const keys = Object.keys(count.attributes);
          if (keys.length === 1) {
            const key = Object.keys(count.attributes)[0];
            metadata.rowCount = parseInt(count.attributes[key]);
          }
        }

        return metadata;
      });
    };

    return _bluebird2.default.join(paginate(), count()).then((_ref) => {
      var _ref2 = _slicedToArray(_ref, 2);

      let rows = _ref2[0],
          metadata = _ref2[1];

      const pageCount = Math.ceil(metadata.rowCount / _limit);
      const pageData = (0, _lodash.assign)(metadata, { pageCount: pageCount });
      return (0, _lodash.assign)(rows, { pagination: pageData });
    });
  }

  bookshelf.Model.prototype.fetchPage = fetchPage;

  bookshelf.Model.fetchPage = function () {
    var _forge;

    return (_forge = this.forge()).fetchPage.apply(_forge, arguments);
  };

  bookshelf.Collection.prototype.fetchPage = function () {
    for (var _len = arguments.length, args = Array(_len), _key = 0; _key < _len; _key++) {
      args[_key] = arguments[_key];
    }

    return fetchPage.apply.apply(fetchPage, [this.model.forge()].concat(args));
  };
};

module.exports = exports['default'];