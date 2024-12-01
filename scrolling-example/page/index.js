import { px } from "@zos/utils"
import { widget } from '@zos/ui'
import { onKey, KEY_UP, KEY_DOWN, KEY_EVENT_CLICK } from '@zos/interaction'
import { onDigitalCrown, KEY_HOME } from '@zos/interaction'

// Подключение библиотеки
import { Scrolling, SCROLL_MODE_HORIZONTAL } from '../libs/scrolling'

Page({
  build() {

    // Создаем прокрутку
    const scrolling = new Scrolling({
      // Режим прокрутки горизонтальный
      // Для вертикального - SCROLL_MODE_VERTICAL
      // Для обоих вариантов - SCROLL_MODE_HORIZONTAL | SCROLL_MODE_VERTICAL (значение по умолчанию)
      mode: SCROLL_MODE_HORIZONTAL,
      step_x: px(60), // Шаг прокрутки
      // Задаем ширину контейнера
      container: {
        w: px(60 * 20),
      },
    });

    // Добавляем на контейнер необходимые элементы
    let x = 0;
    for (let i = 0; i < 20; i++) {
      // scrolling.container - контейнер, на который надо размещать элементы
      const button = scrolling.container.createWidget(widget.BUTTON, {
        x: x,
        y: px(210),
        w: px(60),
        h: px(60),
        radius: 12,
        normal_color: 0xfc6950,
        press_color: 0xfeb4a8,
        text: i,
        click_func: () => {console.log(`CLICK: ${i}`)},
      });
      scrolling.setScrolling(button); // Каждый элемент также должен быть перетаскиваемым
      x += px(60);
    }

    // Прокрутка к заданной позиции
    scrolling.scrollTo({sx: 10, anim: true});

    // Скроллинг клавишами (не обязательно)
    onKey({
      callback: (key, keyEvent) => {
        if (keyEvent === KEY_EVENT_CLICK) {
          if (key === KEY_UP) {
            scrolling.stepTo({kx: -1}); // Прокрутка влево на 1 шаг
          }
          if (key === KEY_DOWN) {
            scrolling.stepTo({kx: 1}); // Прокрутка вправо на 1 шаг
          }
        }
        return false;
      },
    });

    // Скроллинг коронкой (не обязательно)
    onDigitalCrown({
      callback: (key, degree) => {
        if (key === KEY_HOME) {
          scrolling.stepTo({kx: -Math.sign(degree)});
        }
      },
    });

  },

})
