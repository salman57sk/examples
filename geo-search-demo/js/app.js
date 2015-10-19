$(document).ready(function() {



  // INITIALIZATION
  // ==============
  var APPLICATION_ID = 'latency';
  var SEARCH_ONLY_API_KEY = '6be0576ff61c053d5f9a3225e2a90f76';
  var INDEX_NAME = 'airports';
  var PARAMS = { hitsPerPage: 60 };

  // Client + Helper initialization
  var algolia = algoliasearch(APPLICATION_ID, SEARCH_ONLY_API_KEY);
  var algoliaHelper = algoliasearchHelper(algolia, INDEX_NAME, PARAMS);
  algoliaHelper.setQueryParameter('getRankingInfo', true);

  // DOM and Templates binding
  $map = $('#map');
  $hits = $('#hits');
  $stats = $('#stats');
  var hitsTemplate = Hogan.compile($('#hits-template').text());
  var noResultsTemplate = Hogan.compile($('#no-results-template').text());

  // Map initialization
  var map = new google.maps.Map($map.get(0), { streetViewControl: false, mapTypeControl: false, zoom: 4, minZoom: 3, maxZoom: 12, styles: [{ stylers: [{ hue: "#3596D2" }] } ] });
  var fitMapToMarkersAutomatically = true;
  var markers = [];
  var boundingBox;
  var boundingBoxListener;

  // Page states
  var PAGE_STATES = {
    LOAD                   : 0,
    BOUNDING_BOX_RECTANGLE : 1,
    BOUNDING_BOX_POLYGON   : 2,
    BOUNDING_BOX_UNION     : 3,
    AROUND_IP              : 4,
    AROUND_NYC             : 5,
    AROUND_LONDON          : 6,
    AROUND_SYDNEY          : 7
  };
  var pageState = PAGE_STATES.LOAD;
  setPageState(PAGE_STATES.BOUNDING_BOX_RECTANGLE);



  // PAGE STATES
  // ===========
  function setPageState (state) {
    resetPageState();
    beginPageState(state);
  }

  function beginPageState (state) {
    pageState = state;

    switch (state) {
      case PAGE_STATES.BOUNDING_BOX_RECTANGLE:
      boundingBox = new google.maps.Rectangle({
        bounds: { north: 40, south: 60, east: 16, west: -4 },
        strokeColor: '#EF5362',
        strokeOpacity: 0.8,
        strokeWeight: 2,
        fillColor: '#EF5362',
        fillOpacity: 0.15,
        draggable: true,
        editable: true,
        geodesic: true,
        map: map
      });
      algoliaHelper.setQueryParameter('insideBoundingBox', rectangleToAlgoliaParams(boundingBox));
      boundingBoxListener = google.maps.event.addListener(boundingBox, 'bounds_changed', throttle( rectangleBoundsChanged, 150 ));
      break;

      case PAGE_STATES.BOUNDING_BOX_POLYGON:
      boundingBox = new google.maps.Polygon({
        paths: [
        {lat: 25.774, lng: -80.190},
        {lat: 18.466, lng: -66.118},
        {lat: 32.321, lng: -64.757},
        {lat: 25.774, lng: -80.190}
        ],
        strokeColor: '#EF5362',
        strokeOpacity: 0.8,
        strokeWeight: 2,
        fillColor: '#EF5362',
        fillOpacity: 0.15,
        map: map
      });
      algoliaHelper.setQueryParameter('insidePolygon', polygonsToAlgoliaParams(boundingBox));
      break;

      case PAGE_STATES.BOUNDING_BOX_UNION:
      break;

      case PAGE_STATES.AROUND_IP:
      algoliaHelper.setQueryParameter('aroundLatLngViaIP', true);
      algoliaHelper.setQueryParameter('aroundPrecision', 5000);
      break;

      case PAGE_STATES.AROUND_NYC:
      algoliaHelper.setQueryParameter('aroundLatLng', '40.71, -74.01');
      algoliaHelper.setQueryParameter('aroundPrecision', 5000);
      break;

      case PAGE_STATES.AROUND_LONDON:
      algoliaHelper.setQueryParameter('aroundLatLng', '51.50, -0.13');
      algoliaHelper.setQueryParameter('aroundPrecision', 5000);
      break;

      case PAGE_STATES.AROUND_SYDNEY:
      algoliaHelper.setQueryParameter('aroundLatLng', '-33.86, 151.20');
      algoliaHelper.setQueryParameter('aroundPrecision', 5000);
      break;
    }

    fitMapToMarkersAutomatically = true;
    algoliaHelper.search();
  }

  function resetPageState() {
    if (boundingBox) boundingBox.setMap(null);
    if (boundingBoxListener) google.maps.event.removeListener(boundingBoxListener);
    algoliaHelper.setQueryParameter('insideBoundingBox', undefined);
    algoliaHelper.setQueryParameter('aroundLatLng',      undefined);
    algoliaHelper.setQueryParameter('aroundPrecision',   undefined);
    algoliaHelper.setQueryParameter('aroundLatLngViaIP', undefined);
  }



  // DISPLAY RESULTS
  // ===============
  algoliaHelper.on('result', function(content, state) {
    renderMap(content);
    renderHits(content);
  });

  algoliaHelper.on('error', function(error) {
    console.log(error);
  });

  function renderHits(content) {
    if (content.hits.length === 0) {
      $hits.html(noResultsTemplate.render());
      return;
    }
    content.hits = content.hits.slice(0,20);
    for (var i = 0; i<content.hits.length; ++i) {
      var hit = content.hits[i];
      hit.displayCity = (hit.name === hit.city);
      if (hit._rankingInfo.matchedGeoLocation) hit.distance = parseInt(hit._rankingInfo.matchedGeoLocation.distance/1000) + " km";
    }
    $hits.html(hitsTemplate.render(content));
  }

  function renderMap (content) {
    removeMarkersFromMap();
    markers = [];

    for (var i = 0; i<content.hits.length; ++i) {
      var hit = content.hits[i];
      var marker = new google.maps.Marker({
        position: {lat: hit._geoloc.lat, lng: hit._geoloc.lng},
        map: map,
        airport_id: hit.objectID,
        title: hit.name + ' - ' + hit.city + ' - ' + hit.country
      });
      markers.push(marker);
      attachInfoWindow(marker, hit);
    }

    if (fitMapToMarkersAutomatically) fitMapToMarkers();
  }



  // EVENTS BINDING
  // ==============
  $('.change_page_state').on('click', function(e) {
    e.preventDefault();
    updateMenu($(this).data("state"), $(this).data("mode"));
    switch ($(this).data("state")) {
      case "rectangle":
      setPageState(PAGE_STATES.BOUNDING_BOX_RECTANGLE);
      break;
      case "polygon":
      setPageState(PAGE_STATES.BOUNDING_BOX_POLYGON);
      break;
      case "union":
      setPageState(PAGE_STATES.BOUNDING_BOX_UNION);
      break;
      case "ip":
      setPageState(PAGE_STATES.AROUND_IP);
      break;
      case "nyc":
      setPageState(PAGE_STATES.AROUND_NYC);
      break;
      case "london":
      setPageState(PAGE_STATES.AROUND_LONDON);
      break;
      case "sydney":
      setPageState(PAGE_STATES.AROUND_SYDNEY);
      break;
    }
  });



  // HELPER METHODS
  // ==============
  function updateMenu(stateClass, modeClass) {
    $('.change_page_state').removeClass("active");
    $(".change_page_state[data-state='"+stateClass+"']").addClass("active");
    $('.page_mode').removeClass("active");
    $(".page_mode[data-mode='"+modeClass+"']").addClass("active");
  }

  function fitMapToMarkers() {
    var mapBounds = new google.maps.LatLngBounds();
    for (var i = 0; i < markers.length; i++) {
      mapBounds.extend(markers[i].getPosition());
    }
    map.fitBounds(mapBounds);
  }

  function removeMarkersFromMap() {
    for (var i = 0; i < markers.length; i++) {
      markers[i].setMap(null);
    }
  }

  function rectangleBoundsChanged() {
    fitMapToMarkersAutomatically = false;
    algoliaHelper.setQueryParameter('insideBoundingBox', rectangleToAlgoliaParams(boundingBox)).search();
  }

  function rectangleToAlgoliaParams(rectangle) {
    var bounds = rectangle.getBounds();
    var ne = bounds.getNorthEast();
    var sw = bounds.getSouthWest();
    return [ne.lat(), ne.lng(), sw.lat(), sw.lng()].join();
  }

  function polygonsToAlgoliaParams(polygons) {
    points = [];
    polygons.getPaths().forEach(function(path){
      path.getArray().forEach(function(latLng){
        points.push(latLng.lat());
        points.push(latLng.lng());
      });
    });
    return points.join();
  }

  function attachInfoWindow(marker, hit) {
    var message = (hit.name === hit.city) ? hit.name+' - '+hit.country : hit.name+' - '+hit.city+' - '+hit.country;
    var infowindow = new google.maps.InfoWindow({ content: message });
    marker.addListener('click', function() {
      info_window = infowindow.open(marker.get('map'), marker);
      setTimeout(function(){infowindow.close()}, 3000);
    });
  }

  function throttle(func, wait) {
    var context, args, result;
    var timeout = null;
    var previous = 0;
    var later = function() {
      previous = Date.now();
      timeout = null;
      result = func.apply(context, args);
      if (!timeout) context = args = null;
    };
    return function() {
      var now = Date.now();
      var remaining = wait - (now - previous);
      context = this;
      args = arguments;
      if (remaining <= 0 || remaining > wait) {
        if (timeout) {
          clearTimeout(timeout);
          timeout = null;
        }
        previous = now;
        result = func.apply(context, args);
        if (!timeout) {
          context = args = null;
        }
      } else if (!timeout) {
        timeout = setTimeout(later, remaining);
      }
      return result;
    };
  }


});

