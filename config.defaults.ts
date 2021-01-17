export default {
  domain: 'http://proxy',
  token: 'god-proxy',
  flatList: '/bookmarks/trellisfw/asn-staging',
  unflatList: '/bookmarks/trellisfw/asns',
  unflatTree: {
    bookmarks: {
      _type: 'application/vnd.oada.bookmarks.1+json',
      trellisfw: {
        _type: 'application/vnd.trellisfw.1+json',
        documents: {
          _type: 'application/vnd.trellisfw.documents.1+json',
        },
        asns: {
          '_type': 'application/vnd.trellisfw.asns.1+json',
          'day-index': {
            '*': {
              '_type': 'application/vnd.trellisfw.asns.1+json',

              '*': {
                _type: 'application/vnd.trellisfw.asn.sf.1+json',
              },
            },
          },
        },
      },
    },
  },
};
