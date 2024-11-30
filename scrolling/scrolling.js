/**
 * Scrolling - плавная прокрутка с произвольным шагом
 * Version 1.0
 * Arigato Software, 2024
 */

/*
!!! В файл app.json в параметр "permissions" добавить "data:os.device.info"

const scrolling = new Scrolling(params = {}) - создание прокрутки

params:
    mode: SCROLL_MODE_HORIZONTAL | SCROLL_MODE_VERTICAL - направление прокрутки (SCROLL_MODE_HORIZONTAL, SCROLL_MODE_VERTICAL)
    step_x: 1 - шаг прокрутки по горизонтали
    step_y: 1 - шаг прокрутки по вертикали
    k_braking: 0.9 - коэффициент торможения (0..1)
    finishing_speed: 8 - скорость доводки до заданного шага
    container: {} - параметры контейнера
    scroll_frame_func: null - callback(info) функция, вызываемая на каждый кадр прокрутки
    scroll_complete_func: null - callback(info) функция, вызываемая при завершении прокрутки
    gesture_func: null - callback(event) функция обработки свайпов (за пределами контейнера для прокрутки)

info:
    x - смещение контейнера по горизонтали
    y - смещение контейнера по вертикали

container:
    x: 0 - координата x контейнера
    y: 0 - координата y контейнера
    w: width - ширина контейнера
    h: height - высота контейнера
    pos_x: 0 - базовое смещение контейнера по горизонтали
    pos_y: 0 - базовое смещение контейнера по вертикали

scrolling.container - прокручиваемый контейнер, на нем необходимо разместить все элементы
scrolling.setScrolling(element) - сделать элемент перетаскиваемым (применить для каждого элемента на контейнере)
scrolling.step(kx, ky) - Прокрутка на заданное число шагов (kx > 0 - влево; kx < 0 - вправо; ky > 0 - вверх; ky < 0 - вниз)
*/

import { createWidget, widget, event, prop } from '@zos/ui'
import { onGesture } from '@zos/interaction'
import { getDeviceInfo } from '@zos/device'

export const SCROLL_MODE_HORIZONTAL = 1;
export const SCROLL_MODE_VERTICAL = 2;

export class Scrolling {

    constructor(params = {}) {
        this.params = {
            mode: SCROLL_MODE_HORIZONTAL | SCROLL_MODE_VERTICAL,
            step_x: 1,
            step_y: 1,
            finishing_speed: 8,
            k_braking: 0.9,
            scroll_frame_func: null,
            scroll_complete_func: null,
            gesture_func: null,
            ...params,
        };
        this.down = false; // Флаг нажатия по экрану
        this.scrolling = false; // Флаг процесса прокрутки
        this.kx = 0; // Направление смещения контейнера по x
        this.ky = 0; // Направление смещения контейнера по y
        this.x = 0;
        this.y = 0;
        this.timer = null; // Таймер торможения
        this.createContainer();
        this.blockGesture();
    }

    // Создание контейнера
    createContainer() {
        // Чтение параметров
        const { width, height } = getDeviceInfo();
        const params = {
            x: 0,
            y: 0,
            w: width,
            h: height,
            pos_x: 0,
            pos_y: 0,
            scroll_enable: false,
            ...(this.params.container ? this.params.container : {})
        };
        this.pos_x = params.pos_x;
        this.pos_y = params.pos_y;
        this.max_x = params.w - width;
        this.max_y = params.h - height;

        // Создание контейнера
        this.container = createWidget(widget.VIEW_CONTAINER, params);

        // Создание прямоугольника, за который можно будет перетаскивать контейнер
        const rect = this.container.createWidget(widget.STROKE_RECT, {
            x: 0,
            y: 0,
            w: params.w,
            h: params.h,
            radius: 0,
            alpha: 0,
            color: 0x000000,
        });
        this.setScrolling(rect); // Чтобы за данный элемент можно было тянуть контейнер
    }

    // Блокировка свайпов
    blockGesture() {
        onGesture({
            callback: (event) => {
                if (this.scrolling) {
                    return true
                } else {
                    return this.params?.gesture_func(event);
                }
            },
        });
    }

    // Прокрутка на заданное число шагов
    step(kx, ky) {
        this.base_kx = kx;
        this.base_ky = ky;
        this.pos_x += kx;
        this.pos_y += ky;
        this.finishing(Math.round(Math.abs(kx)), Math.round(Math.abs(ky)));
    }

    // Обработка событий перемещения по экрану
    setScrolling(element) {
        element.addEventListener(event.CLICK_DOWN, (info) => this.onClickDown(info));
        element.addEventListener(event.CLICK_UP, (info) => this.onClickUp(info));
        element.addEventListener(event.MOVE, (info) => this.onMove(info));
    }

    // Обработчик нажатия на экран
    onClickDown(info) {
        this.x = info.x;
        this.y = info.y;
        this.down = true;
    }

    // Обработчик отпускания экрана
    onClickUp(info) {
        this.down = false;
        this.braking();
    }

    // Обработчик перемещения по экрану
    onMove(info) {
        if (!this.down) return;
        this.scrolling = true;
        this.kx = info.x - this.x;
        this.ky = info.y - this.y;
        this.x = info.x;
        this.y = info.y;
        this.move();
    }

    // Перемещение контейнера
    move() {
        if (this.params.mode & SCROLL_MODE_HORIZONTAL) {
            this.move_x();
        }
        if (this.params.mode & SCROLL_MODE_VERTICAL) {
            this.move_y();
        }
        this.container.setProperty(prop.MORE, { pos_x: this.pos_x, pos_y: this.pos_y });
        this.params.scroll_frame_func?.({ x: this.pos_x, y: this.pos_y });
    }

    // Горизонтальное перемещение
    move_x() {
        this.pos_x += this.kx;
        if (this.pos_x > this.params.step_x) {
            this.pos_x = this.params.step_x;
            this.kx = 0;
        }
        if (this.pos_x < -this.max_x - this.params.step_x) {
            this.pos_x = -this.max_x - this.params.step_x;
            this.kx = 0;
        }
    }

    // Вертикальное перемещение
    move_y() {
        this.pos_y += this.ky;
        if (this.pos_y > this.params.step_y) {
            this.pos_y = this.params.step_y;
            this.ky = 0;
        }
        if (this.pos_y < -this.max_y - this.params.step_y) {
            this.pos_y = -this.max_y - this.params.step_y;
            this.ky = 0;
        }
    }

    // Эффект торможения
    braking() {
        if (this.timer) clearInterval(this.timer);
        this.base_kx = this.kx;
        this.base_ky = this.ky;
        this.timer = setInterval(() => {
            this.kx = Math.trunc(this.kx * this.params.k_braking);
            this.ky = Math.trunc(this.ky * this.params.k_braking);
            if (Math.abs(this.kx) <= this.params.finishing_speed && Math.abs(this.ky) <= this.params.finishing_speed) {
                this.finishing();
            } else {
                this.move();
            }
        }, 0);
    }

    // Доводка прокрутки под заданный шаг
    finishing(sx = 1, sy = 1) {
        if (this.timer) clearInterval(this.timer);
        if (this.params.mode & SCROLL_MODE_HORIZONTAL) {
            this.finish_x = Math.floor(this.pos_x / this.params.step_x + (this.base_kx > 0 ? sx : -sx + 1)) * this.params.step_x;
            if (this.pos_x <= -this.max_x || this.finish_x < -this.max_x) this.finish_x = -this.max_x;
            if (this.pos_x >= 0 || this.finish_x > 0) this.finish_x = 0;
        } else {
            this.finish_x = this.pos_x;
        }
        if (this.params.mode & SCROLL_MODE_VERTICAL) {
            this.finish_y = Math.floor(this.pos_y / this.params.step_y + (this.base_ky > 0 ? sy : -sy + 1)) * this.params.step_y;
            if (this.pos_y <= -this.max_y || this.finish_y < -this.max_y) this.finish_y = -this.max_y;
            if (this.pos_y >= 0 || this.finish_y > 0) this.finish_y = 0;
        } else {
            this.finish_y = this.pos_y;
        }
        this.kx = this.params.finishing_speed * Math.sign(this.finish_x - this.pos_x);
        this.ky = this.params.finishing_speed * Math.sign(this.finish_y - this.pos_y);
        this.timer = setInterval(() => {
            if (Math.abs(this.pos_x - this.finish_x) < this.params.finishing_speed) {
                this.kx = 0;
                this.pos_x = this.finish_x;
            }
            if (Math.abs(this.pos_y - this.finish_y) < this.params.finishing_speed) {
                this.ky = 0;
                this.pos_y = this.finish_y;
            }
            this.move();
            if (this.kx == 0 && this.ky == 0) {
                clearInterval(this.timer);
                this.timer = null;
                this.scrolling = false;
                this.params.scroll_complete_func?.({ x: this.pos_x, y: this.pos_y });
            }
        }, 0);
    }

}