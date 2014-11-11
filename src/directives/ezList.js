(function() {
  'use strict';

  angular.module('ez.list').directive('ezList', ['EzListConfig', 'Draggable', '$compile', '$templateCache', function(EzListConfig, Draggable, $compile, $templateCache) {
    return {
      restrict: 'A',
      replace: true,
      transclude: true,
      scope: {
        item: '=?ezList',
        config: '=?ezConfig'
      },
      template: '<div class="ez-list" ng-class="{\'ez-list-draggable\': options.allowDrag, \'ez-no-placeholder\': !options.showPlaceholder, \'ez-droponly\': options.dropOnly, \'ez-list-empty\': !hasItems}">' +
        '<ul class="ez-list-items">' +
          '<li class="ez-list-item" ng-repeat="item in item[options.childrenField]" ng-include="\'ez-list-tpl.html\'"></li>' +
        '</ul>' +
        '</div>',
      link: function(scope, $element, attrs, ctrl, transclude) {
        scope.options = angular.extend({}, EzListConfig, scope.config);

        // give child items access to the transclude
        scope.options.transclude = transclude;

        var hasItems;
        var element = $element[0];

        if (scope.options.dropOnly) {
          scope.options.allowInsertion = false;
          scope.options.allowNesting = false;
          scope.options.openOnSlide = false;
          scope.options.showPlaceholder = false;
        }

        if (!scope.item) {
          scope.item = {};
          scope.hasItems = false;

          Draggable.setDropzone(element, scope.options);
        } else {
          scope.$watchCollection('item.' + scope.options.childrenField, function(newVal, oldVal) {
            scope.hasItems = newVal && newVal.length;

            if (oldVal && oldVal.length === 0 && newVal.length > 0) {
              Draggable.unsetDropzone(element);
            }

            if (oldVal && newVal.length === 0) {
              Draggable.setDropzone(element, scope.options);
            }
          });

        }
      }
    };
  }]);

})();