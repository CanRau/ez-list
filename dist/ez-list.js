(function() {
'use strict';

angular.module('ez.list', [])
.constant('EzListConfig', {
    acceptClass: 'ez-dragging', // item class to accept in dropzones
    listChildrenField: 'items',
    childrenField: 'items',
    collapsedField: 'collapsed',
    showPlaceholder: true, // show placeholder where item will drop
    collapsed: true, // initial item collapsed state
    allowDrag: true, // allow items to be draggable
    allowNesting: true, // allow items to be nested inside one another
    allowInsertion: true, // allow items to be inserted next to one another
    openOnSlide: true, // open an item when a drag item is slid under and to the right
    closeOnDrag: false, // close item on drag init
    dropOnly: false, // only allow dragged items to be dropped on 1st level items
    xThreshold: 15, // Amount of drag (in px) required for left - right movement
    yThreshold: 5, // Amount of drag (in px) required for up - down movement
    methods: {} // transcluded methods to bind to the scope
}).directive('ezList', ['EzListConfig', 'Draggable', function(EzListConfig, Draggable) {
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

        scope.depth = 0;

        for (var k in scope.options.methods) {
          scope[k] = scope.options.methods[k];
        }

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

          $element.addClass('has-dropzone');
          Draggable.setDropzone(element, scope.options);
        } else {
          scope.$watchCollection('item.' + scope.options.childrenField, function(newVal) {
            scope.hasItems = newVal && newVal.length;

            if (newVal && newVal.length > 0 && $element.hasClass('has-dropzone')) {
              $element.removeClass('has-dropzone');
              Draggable.unsetDropzone(element);
            }

            if (!newVal && !$element.hasClass('has-dropzone')) {
              $element.addClass('has-dropzone');
              Draggable.setDropzone(element, scope.options);
            }
          });

        }
      }
    };
}])
.directive('ezListItem', ['Draggable', function(Draggable) {
    return {
      restrict: 'C',
      link: function (scope, $element) {
        var element = $element[0];

        if (scope.options.transclude) {
          // add transcluded item content
          scope.options.transclude(scope, function(clone) {
            angular.element(element.children[0].children[0]).append(clone);
          });
        }

        $element.on(interact.supportsTouch() ? 'touchstart' : 'mousedown', function(e) {
          if (scope.options.allowDrag === true || (typeof scope.options.allowDrag === 'function' && scope.options.allowDrag(e, scope.item))) {
            Draggable.init(e, scope);
          }
        });

        if (!scope.item.hasOwnProperty('collapsed')) {
          scope.item[scope.options.collapsedField] = scope.options.collapsed;
        }

        scope.$watchCollection('item.' + scope.options.childrenField, function(newVal) {
          scope.hasItems = newVal && newVal.length;
        });

        scope.remove = function() {
          scope.$parent.$parent.item[scope.options.childrenField].splice(scope.$parent.$parent.item[scope.options.childrenField].indexOf(scope.item), 1);
        };

        scope.$on('$destroy', function() {
          Draggable.unsetDropzone($element[0]);
        });

      }
    };
}])
.factory('Draggable', [function() {
    var dragItem,
        dragItemEl,
        $dragItemEl,
        dragList,
        dragListScope,
        dragItemIndex,
        dragContainerEl = angular.element('<ul class="ez-drag-container"></ul>')[0], // drag container element
        placeholderEl = angular.element('<li class="ez-placeholder"></li>')[0], // placeholder element
        dragX = 0, // x coordinate of drag element
        dragY = 0, // y coordinate of drag element
        dragDx = 0,
        dragDy = 0,
        dragMoveX = 0, // number of moves in the x direction
        dragDirectionX,
        dragDirectionY,
        dropItemEl,
        $dropItemEl,
        dropItem,
        dropList,
        dropInteracts,
        prevDragDirectionX, // which way the item is being dragged ['left', 'right']
        listContainerEl,
        $listContainerEl,
        listContainerScope,
        prevListContainerEl,
        $prevListContainerEl,
        prevListContainerScope,
        hasDragged,
        dragOptions = {};

    return {

      /**
       * Initialize a draggable item
       */
      init: function(e, scope) {
        var self = this;

        if (
          !e.target.hasAttribute('ez-drag-handle') ||
          (typeof e.button !== 'undefined' && e.button !== 0) // disable right click
        ) {
          return;
        }

        e.preventDefault();
        e.stopPropagation();

        $(document).one(interact.supportsTouch() ? 'touchend' : 'mouseup', function() {
          // allow drag events to finish first
          setTimeout(function() {
            self.destroy();
          }, 50);
        });

        $dragItemEl = angular.element(e.target).closest('.ez-list-item');
        dragItemEl = $dragItemEl[0];
        $listContainerEl = $(e.target).closest('.ez-list');
        listContainerEl = $listContainerEl[0];
        listContainerScope = $listContainerEl.isolateScope();

        this.setDropzones();

        dragOptions = listContainerScope.options;
        dragItem = scope.item;
        dragListScope = scope.$parent.$parent;
        dragList = dragListScope.item;
        dragItemIndex = dragList[listContainerScope.options.childrenField].indexOf(dragItem);

        this.initDragContainer();

        if (dragOptions.closeOnDrag) {
          dragItem[dragOptions.collapsedField] = true;
          dragListScope.$apply();
        } else {
          placeholderEl.style.height = $dragItemEl.height() + 'px';
        }

        // prevent nested items within the dragged item from being accepted by a dropzone
        dragItemEl.classList.add(listContainerScope.options.acceptClass);

        dragItemEl.parentNode.insertBefore(placeholderEl, dragItemEl);

        if (dragContainerEl.parentNode !== listContainerEl) {
          listContainerEl.appendChild(dragContainerEl);
        }

        dragContainerEl.appendChild(dragItemEl);

        listContainerEl.classList.add('ez-drag-origin');
        listContainerEl.classList.add('ez-list-target');

        interact.dynamicDrop(true);

        // make clicked item draggable
        interact(dragItemEl).draggable({
          onstart: self.start.bind(this),
          onmove: self.move.bind(this),
          onend: self.end.bind(this)
        }).actionChecker(function(e, action) {
          if (typeof e.button !== 'undefined') {
            return e.button === 0 ? action : null; // disable right click
          }

          return action;
        });

        // get the drag started
        interact.simulate('drag', dragItemEl, e);

        dragItemEl.classList.add('ez-dragging');

      },

      setDropzones: function() {
        $dragItemEl.find('.ez-list-item-content').removeClass('ez-dropzone');

        dropInteracts = interact('.ez-dropzone').dropzone({
          ondragenter: this.enter.bind(this),
          ondragleave: this.leave.bind(this),
          ondrop: this.drop.bind(this)
        });
      },

      setDropzone: function(el, options) {
        interact(el).dropzone({
          accept: options.accept,
          ondragenter: this.enter.bind(this),
          ondragleave: this.leave.bind(this),
          ondrop: this.drop.bind(this)
        });

      },

      unsetDropzone: function(el) {
        interact(el).dropzone(false);
      },

      unsetDropzones: function() {
        dropInteracts.unset();

        $dragItemEl.find('.ez-list-item-content').addClass('ez-dropzone');
      },

      /**
       * Fires once when an item enters another
       */
      enter: function(e) {
        var _listContainerEl;

        if (angular.element(e.target).hasClass('ez-list')) {
          // drop target is an empty list
          _listContainerEl = e.target;

          this.setDropItem(_listContainerEl);
        } else {
          this.setDropItem(e.target.parentNode.parentNode);
          dropItemEl.children[0].children[0].classList.add('ez-dragover');

          _listContainerEl = $dropItemEl.closest('.ez-list')[0];
        }

        if (_listContainerEl !== listContainerEl) {
          if (listContainerEl) {
            prevListContainerEl = listContainerEl;
            $prevListContainerEl = $listContainerEl;
            prevListContainerScope = listContainerScope;

            prevListContainerEl.classList.remove('ez-list-target');
          }

          listContainerEl = _listContainerEl;
          $listContainerEl = angular.element(listContainerEl);
          listContainerScope = $listContainerEl.isolateScope();

          console.log('enter', listContainerScope);

          listContainerEl.classList.add('ez-list-target');

          _listContainerEl = null;
        }
      },

      /**
       * Fires once when an item leaves another
       */
      leave: function() {
        dropItemEl.children[0].children[0].classList.remove('ez-dragover');

        if ($dropItemEl.hasClass('ez-list')) {
          // drop target was an empty list
          listContainerEl.classList.remove('ez-list-target');
          listContainerEl = null;
        } else {
          // drop target was a list item

          if (listContainerScope.options.allowInsertion) {
            if (dragDirectionY === 'up') {
              this.moveUp();
            } else {
              this.moveDown();
            }
          }
        }

        if (listContainerScope.options.dropOnly) {
          listContainerEl = null;
        }
      },

      /**
       * Fires when an item is dropped on a dropzone item
       */
      drop: function() {
        if (!dropItemEl) {
          return;
        }

        console.log('drrooop');
        if (listContainerScope.options.hasOwnProperty('onDrop')) {
          var allowDrop = listContainerScope.options.onDrop(dragItem, $dropItemEl.scope().item);

          if (allowDrop === false) {
            console.log('hooo');
            // make item go back to original position
            listContainerEl = null;
          }
        }
      },

      start: function() {
        hasDragged = true;
      },

      move: function(e) {
        dragDx = dragDx + e.dx;
        dragDy = dragDy + e.dy;

        this.setDragContainerElPosition();

        if (listContainerEl === null || !listContainerScope.options.allowInsertion) {
          return;
        }

        if (listContainerScope.options.allowNesting && e.dx !== 0 && e.dy === 0) {
          if (e.dx > 0) {
            dragDirectionX = 'right';
          } else {
            dragDirectionX = 'left';
          }

          if (prevDragDirectionX !== dragDirectionX) {
            dragMoveX = 0;
            prevDragDirectionX = dragDirectionX;
          }

          dragMoveX = dragMoveX + Math.abs(e.dx);

          // reduce jumping by requiring min drag movement for a direction change
          if (dragMoveX > listContainerScope.options.xThreshold) {
            dragMoveX = 0;

            if (dragDirectionX === 'right') {
              this.moveRight();
            } else {
              this.moveLeft();
            }

            return;
          }
        }

        // disable y movement if movement is significant in x direction
        if (!dropItemEl || Math.abs(e.dx) > 5 || e.dy === 0) {
          return;
        }

        if (e.dy > 0) {
          dragDirectionY = 'down';
        } else {
          dragDirectionY = 'up';
        }
      },

      /**
       * Drag end handler
       */
      end: function() {
        // allow drop method to execute prior to drag end
        setTimeout(function() {
          interact.dynamicDrop(false);

          if (!placeholderEl.parentNode) {
            return;
          }

          var index = Array.prototype.indexOf.call(placeholderEl.parentNode.children, placeholderEl);

          if (dropItemEl) {
            dropItemEl.children[0].children[0].classList.remove('ez-dragover');
          }

          dropList = angular.element(placeholderEl.parentNode).scope().item;

          dragItemEl.classList.remove(dragOptions.acceptClass);

          dragContainerEl.removeChild(dragItemEl);

          dragList[dragOptions.childrenField].splice(dragItemIndex, 1);

          dragListScope.$apply();

          console.log('end', listContainerEl);
          if (!!listContainerEl && listContainerScope.options.dropOnly) {
            return;
          } else if (!!listContainerEl && listContainerScope.options.allowInsertion) {
            // add drag item to target items array
            if (!!dropList && dropList.hasOwnProperty(listContainerScope.options.childrenField)) {
              dropList[listContainerScope.options.childrenField].splice(index, 0, dragItem);
            } else {
              dropList[listContainerScope.options.childrenField] = [dragItem];
            }
          } else {
            // return item back to origin
            console.log('hahha', dragList, dragItemIndex, dragItem);
            dragList[dragListScope.options.childrenField].splice(dragItemIndex, 0, dragItem);
          }

          if (typeof dragListScope.onMove === 'function') {
            dragListScope.options.onMove(dragItem, dropItem);
          }

          listContainerScope.$apply();
        });
      },

      /**
       * Initialize the drag container position
       */
      initDragContainer: function() {
        var listContainerPosition = listContainerEl.getBoundingClientRect();
        var dragPosition = dragItemEl.getBoundingClientRect();

        dragDx = 0;
        dragDy = 0;
        dragX = dragPosition.left - listContainerPosition.left;
        dragY = dragPosition.top - listContainerPosition.top;

        dragContainerEl.style.top = (dragY + 2) + 'px';
        dragContainerEl.style.left = (dragX + 2) + 'px';
        dragContainerEl.style.width = (dragPosition.right - dragPosition.left - 1) + 'px';
        this.setDragContainerElPosition();
      },

      setDropItem: function(el) {
        dropItemEl = el;
        $dropItemEl = angular.element(el);
        dropItem = $dropItemEl.scope().item;
      },

      /**
       * Set transform style on drag container element
       */
      setDragContainerElPosition: function() {
        dragContainerEl.style.webkitTransform = dragContainerEl.style.transform = 'translate3D(' + dragDx + 'px, ' + dragDy + 'px, 0px)';
      },

      moveLeft: function() {
        if (placeholderEl.nextElementSibling) { // only allow left if placeholder is last
          return;
        }

        this.setDropItem(placeholderEl.parentNode.parentNode.parentNode);

        if (!dropItem || !dropItemEl || !dropItemEl.nextSibling) {
          return;
        }

        dropItemEl.parentNode.insertBefore(placeholderEl, dropItemEl.nextSibling);
      },

      /**
       * Move placeholder to the right
       */
      moveRight: function() {
        if (!placeholderEl.previousElementSibling) {
          return;
        }

        this.setDropItem(placeholderEl.previousElementSibling);

        if (listContainerScope.options.openOnSlide && dropItem[listContainerScope.options.collapsedField] === true) {
          dropItem[listContainerScope.options.collapsedField] = false;

          listContainerScope.$apply();

          dropItemEl.children[0].children[1].insertBefore(placeholderEl, dropItemEl.children[0].children[1].children[0]);
        } else {
          dropItemEl.children[0].children[1].appendChild(placeholderEl);
        }
      },

      moveUp: function() {
          dropItemEl.parentNode.insertBefore(placeholderEl, dropItemEl);
      },

      moveDown: function() {
          var innerList = dropItemEl.children[0].children[1];

          if (innerList && innerList.children[0]) {
            // move in if list is not collapsed
            innerList.insertBefore(placeholderEl, innerList.children[0]);
          } else {
            dropItemEl.parentNode.insertBefore(placeholderEl, dropItemEl.nextElementSibling);
          }
      },

      /**
       * Clean up
       */
      destroy: function() {
        if (!hasDragged) {
           //put the drag element back in the list since angular aint gonna do it
          placeholderEl.parentNode.insertBefore(dragItemEl, placeholderEl);
        }

        if (placeholderEl.parentNode) {
          placeholderEl.parentNode.removeChild(placeholderEl);
        }

        dragItemEl.classList.remove('ez-dragging');

        if (listContainerEl) {
          listContainerEl.classList.remove('ez-drag-origin');
          listContainerEl.classList.remove('ez-list-target');
        }
        if (prevListContainerEl) {
          prevListContainerEl.classList.remove('ez-drag-origin');
          prevListContainerEl.classList.remove('ez-list-target');
        }

        this.unsetDropzones();

        prevListContainerEl = $prevListContainerEl = prevListContainerScope = listContainerEl = $listContainerEl = listContainerScope = $dragItemEl = dragItemEl = dragList = dragItem = dragItemIndex = hasDragged = null;
      }

    };

}])

})();
